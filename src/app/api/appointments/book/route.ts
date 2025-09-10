import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";

type WeekKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
type TimeRange = { start: string; end: string };
type AdHocBusy = { date: string; start: string; end: string };

function initAdmin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON missing");
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
}
initAdmin();

const adminAuth = getAdminAuth();
const db = getFirestore();

function wkKey(d: Date): WeekKey {
  return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()] as WeekKey;
}
function toDate(dateISO: string, time: string) {
  const [h, m] = (time || "00:00").split(":").map(Number);
  const d = new Date(dateISO + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d;
}
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return !(aEnd <= bStart || bEnd <= aStart);
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const studentId = decoded.uid;
    const claimRoles: string[] = (decoded as any).roles || [];

    const body = await req.json();
    const teacherId: string = String(body?.teacherId || "");
    const date: string = String(body?.date || "");
    const start: string = String(body?.start || "");
    const end: string = String(body?.end || "");
    const note: string = typeof body?.note === "string" ? body.note : "";

    if (!teacherId || !date || !start || !end) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const startAt = toDate(date, start);
    const endAt = toDate(date, end);
    if (!(endAt > startAt)) {
      return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
    }

    // Weekends not bookable
    const dow = startAt.getDay();
    if (dow === 0 || dow === 6) {
      return NextResponse.json({ error: "Weekends are not bookable" }, { status: 400 });
    }

    // 🚫 Block same-day bookings
    const today = new Date();
    if (isSameDay(today, startAt)) {
      return NextResponse.json({ error: "Same-day bookings are not allowed" }, { status: 400 });
    }

    // Only students (not admin/teacher) can book
    if (claimRoles.includes("admin") || claimRoles.includes("teacher")) {
      return NextResponse.json({ error: "Only students can book" }, { status: 403 });
    }

    // Must be approved
    const userDoc = await db.collection("users").doc(studentId).get();
    const approved = !!userDoc.data()?.approved;
    if (!approved) {
      return NextResponse.json({ error: "Account pending approval" }, { status: 403 });
    }

    // Admin settings (workday + holidays)
    const adminSnap = await db.collection("adminSettings").doc("global").get();
    const admin = adminSnap.exists ? (adminSnap.data() as any) : {};
    const workdayStart: string = admin?.workdayStart || "09:00";
    const workdayEnd: string = admin?.workdayEnd || "17:00";
    const holidays: { date: string }[] = Array.isArray(admin?.holidays) ? admin.holidays : [];

    const ws = toDate(date, workdayStart);
    const we = toDate(date, workdayEnd);
    if (startAt < ws || endAt > we) {
      return NextResponse.json({ error: "Outside working hours" }, { status: 400 });
    }
    if (holidays.some((h) => h.date === date)) {
      return NextResponse.json({ error: "Selected day is a holiday" }, { status: 400 });
    }

    // Teacher availability
    const availSnap = await db.collection("teacherAvailability").doc(teacherId).get();
    const weekly: Record<WeekKey, TimeRange[]> =
      (availSnap.exists && (availSnap.data()!.weekly as Record<string, TimeRange[]>))
        ? (availSnap.data()!.weekly as Record<WeekKey, TimeRange[]>)
        : { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };

    const adHoc: AdHocBusy[] = Array.isArray(availSnap.data()?.busy)
      ? (availSnap.data()!.busy as AdHocBusy[])
      : [];

    const wk = wkKey(startAt);
    const weeklyRanges: TimeRange[] = Array.isArray(weekly[wk]) ? weekly[wk] : [];

    // Block overlap with weekly class hours
    const weeklyBusyOverlap = weeklyRanges.some((r: TimeRange) =>
      overlaps(startAt, endAt, toDate(date, r.start), toDate(date, r.end))
    );
    if (weeklyBusyOverlap) {
      return NextResponse.json({ error: "Overlaps teacher class hours" }, { status: 400 });
    }

    // Block overlap with ad-hoc busy
    const adHocBusyOverlap = adHoc
      .filter((b: AdHocBusy) => b.date === date)
      .some((b: AdHocBusy) => overlaps(startAt, endAt, toDate(date, b.start), toDate(date, b.end)));
    if (adHocBusyOverlap) {
      return NextResponse.json({ error: "Overlaps teacher busy time" }, { status: 400 });
    }

    // Prevent duplicate same-slot request by same student
    const dayStart = new Date(date + "T00:00:00");
    const dayEnd = new Date(date + "T23:59:59");
    const snap = await db
      .collection("appointments")
      .where("teacherId", "==", teacherId)
      .where("startAt", ">=", Timestamp.fromDate(dayStart))
      .where("startAt", "<=", Timestamp.fromDate(dayEnd))
      .get();

    const sameSlotMine = snap.docs.find((d) => {
      const a = d.data() as any;
      const st = (a.startAt as Timestamp).toDate();
      const en = (a.endAt as Timestamp).toDate();
      const sameWindow = st.getTime() === startAt.getTime() && en.getTime() === endAt.getTime();
      return a.studentId === studentId && (a.status === "pending" || a.status === "approved") && sameWindow;
    });
    if (sameSlotMine) {
      return NextResponse.json({ error: "You already requested this slot" }, { status: 409 });
    }

    // Prevent overlap with already-approved appts for this teacher
    const teacherOverlap = snap.docs.some((d) => {
      const a = d.data() as any;
      if (a.status !== "approved") return false;
      const st = (a.startAt as Timestamp).toDate();
      const en = (a.endAt as Timestamp).toDate();
      return overlaps(startAt, endAt, st, en);
    });
    if (teacherOverlap) {
      return NextResponse.json({ error: "Slot already taken" }, { status: 409 });
    }

    // Create pending appointment
    await db.collection("appointments").add({
      teacherId,
      studentId,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      status: "pending",
      note: note || "",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
