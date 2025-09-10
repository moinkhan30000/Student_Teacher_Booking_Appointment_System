import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";

function initAdmin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON missing");
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
}
initAdmin();

const db = getFirestore();

type Range = { start: string; end: string };
type Busy = { date: string; start: string; end: string; source: string; note?: string };

function wkKey(d: Date): "sun"|"mon"|"tue"|"wed"|"thu"|"fri"|"sat" {
  return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()] as any;
}
function sameDayISO(d: Date) { return d.toISOString().slice(0,10); }
function addBusyDay(acc: Busy[], date: string, ranges: Range[], source: string) {
  for (const r of ranges) if (r.end > r.start) acc.push({ date, start: r.start, end: r.end, source });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const teacherId = String(body?.teacherId || "");
    const from = String(body?.from || "");
    const to = String(body?.to || "");
    if (!teacherId || !from || !to) {
      return NextResponse.json({ error: "teacherId, from (YYYY-MM-DD), to required" }, { status: 400 });
    }

    const fromD = new Date(from + "T00:00:00");
    const toD = new Date(to + "T00:00:00");
    if (isNaN(fromD.getTime()) || isNaN(toD.getTime()) || toD < fromD) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const [adminDoc, availDoc] = await Promise.all([
      db.collection("adminSettings").doc("global").get(),
      db.collection("teacherAvailability").doc(teacherId).get(),
    ]);

    const admin = adminDoc.exists ? (adminDoc.data() as any) : {};
    const workStart: string = admin?.workdayStart || "09:00";
    const workEnd: string = admin?.workdayEnd || "17:00";
    const holidays: { date: string; name?: string }[] = Array.isArray(admin?.holidays) ? admin.holidays : [];

    const avail = availDoc.exists ? (availDoc.data() as any) : {};
    const weekly: Record<string, Range[]> = avail?.weekly || {};
    const busyList: Busy[] = Array.isArray(avail?.busy)
      ? avail.busy.map((b: any) => ({ date: String(b.date), start: String(b.start), end: String(b.end), source: "teacher-busy", note: b.note }))
      : [];

    // Query approved appointments
    let appts: Busy[] = [];
    try {
      const apptsSnap = await db
        .collection("appointments")
        .where("teacherId", "==", teacherId)
        .where("status", "==", "approved")
        .where("startAt", ">=", Timestamp.fromDate(fromD))
        .where("startAt", "<", Timestamp.fromDate(new Date(toD.getTime() + 86400000)))
        .get();

      appts = apptsSnap.docs.map((doc) => {
        const a = doc.data() as any;
        const s = (a.startAt as Timestamp).toDate();
        const e = (a.endAt as Timestamp).toDate();
        const d = sameDayISO(s);
        const start = s.toTimeString().slice(0,5);
        const end = e.toTimeString().slice(0,5);
        return { date: d, start, end, source: "appointment" } as Busy;
      });
    } catch (err: any) {
      // If Firestore index is still building or missing, surface a clear message
      const code = err?.code ?? err?.status?.code ?? err?.status;
      if (code === 9 || String(err?.message || "").includes("FAILED_PRECONDITION")) {
        return NextResponse.json(
          { error: "Calendar index is building. Try again shortly." },
          { status: 503 }
        );
      }
      throw err;
    }

    const out: Busy[] = [];

    // Admin holidays → full-day busy
    for (const h of holidays) {
      const d = String(h.date);
      if (d >= from && d <= to) {
        out.push({ date: d, start: "00:00", end: "23:59", source: "admin-holiday", note: h.name || "Holiday" });
      }
    }

    // Weekly class hours (recurring busy)
    for (let t = fromD.getTime(); t <= toD.getTime(); t += 86400000) {
      const d = new Date(t);
      const dateISO = sameDayISO(d);
      const wk = wkKey(d);
      const wr: Range[] = Array.isArray((weekly as any)[wk]) ? (weekly as any)[wk] : [];
      const clipped = wr.filter(r => r.end > r.start); // already validated on save
      addBusyDay(out, dateISO, clipped, "teacher-weekly");
    }

    // Ad-hoc busy
    out.push(...busyList.filter(b => b.date >= from && b.date <= to));

    // Approved appts
    out.push(...appts);

    return NextResponse.json({
      workday: { start: workStart, end: workEnd },
      busy: out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
