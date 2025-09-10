import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

// ---- Admin init ----
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

// ------- Types -------
const WD = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Weekday = typeof WD[number];

type TimeRange = { start: string; end: string };
type WeeklyRanges = Partial<Record<Weekday, TimeRange[]>>;
type BusyBlock = { date: string; start: string; end: string; note?: string };

function union(a: unknown, b: unknown): string[] {
  const A = Array.isArray(a) ? (a as string[]) : [];
  const B = Array.isArray(b) ? (b as string[]) : [];
  return Array.from(new Set([...A, ...B].filter(Boolean)));
}

async function requireUser(req: NextRequest) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return { error: "Missing token", code: 401 as const };
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, claimRoles: (decoded as any).roles || [] };
  } catch {
    return { error: "Invalid token", code: 401 as const };
  }
}

async function getAdminSettings() {
  const snap = await db.collection("adminSettings").doc("global").get();
  const d = snap.exists ? (snap.data() as any) : {};
  const workdayStart: string = d?.workdayStart || "09:00";
  const workdayEnd: string = d?.workdayEnd || "17:00";
  const holidays: { date: string; name?: string }[] = Array.isArray(d?.holidays) ? d.holidays : [];
  return { workdayStart, workdayEnd, holidays };
}

async function getUserDoc(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  const d = snap.exists ? (snap.data() as any) : {};
  return {
    roles: Array.isArray(d?.roles) ? (d.roles as string[]) : [],
    approved: !!d?.approved,
  };
}

function availDoc(uid: string) {
  return db.collection("teacherAvailability").doc(uid);
}

const DEFAULT_WEEKLY: WeeklyRanges = {};

// handy validator
function withinWorkday(start: string, end: string, ws: string, we: string) {
  return start >= ws && end <= we && end > start;
}

// ---------- GET ----------
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.code });
  const { uid, claimRoles } = auth;

  const [{ roles: docRoles, approved }, adminSettings] = await Promise.all([
    getUserDoc(uid),
    getAdminSettings(),
  ]);
  const roles = union(claimRoles, docRoles);

  if (!roles.includes("teacher")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!approved) return NextResponse.json({ error: "Not approved" }, { status: 403 });

  const snap = await availDoc(uid).get();
  const d = snap.exists ? (snap.data() as any) : {};
  const weekly: WeeklyRanges = d?.weekly || DEFAULT_WEEKLY;
  const busy: BusyBlock[] = Array.isArray(d?.busy) ? d.busy : [];

  return NextResponse.json({
    roles,
    approved,
    admin: adminSettings, 
    weekly,
    busy,
  });
}


export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.code });
  const { uid, claimRoles } = auth;

  const [{ roles: docRoles, approved }, adminSettings] = await Promise.all([
    getUserDoc(uid),
    getAdminSettings(),
  ]);
  const roles = union(claimRoles, docRoles);
  if (!roles.includes("teacher")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!approved) return NextResponse.json({ error: "Not approved" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ws = adminSettings.workdayStart;
  const we = adminSettings.workdayEnd;

  // ----- Sanitize weekly (class hours) -----
  const weeklyRaw = (body as any)?.weekly;
  const weekly: WeeklyRanges = {};
  WD.forEach((day) => {
    const arr = Array.isArray(weeklyRaw?.[day]) ? (weeklyRaw[day] as unknown[]) : [];
    const cleaned: TimeRange[] = arr
      .filter((r: unknown): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r): TimeRange => {
        const start = String((r as any).start ?? "");
        const end = String((r as any).end ?? "");
        return { start, end };
      })
      .filter((r) => withinWorkday(r.start, r.end, ws, we));
    if (cleaned.length) weekly[day] = cleaned;
  });

  // ----- Sanitize busy (ad-hoc) -----
  const today = new Date().toISOString().slice(0, 10);
  const busyInput = Array.isArray((body as any)?.busy) ? ((body as any).busy as unknown[]) : [];
  const busy: BusyBlock[] = busyInput
    .filter((b: unknown): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((r): BusyBlock => {
      const date = String((r as any).date ?? "").slice(0, 10);
      const start = String((r as any).start ?? "");
      const end = String((r as any).end ?? "");
      const note = typeof (r as any).note === "string" ? ((r as any).note as string) : undefined;
      return { date, start, end, note };
    })
    .filter((b: BusyBlock) => Boolean(b.date) && b.date >= today && withinWorkday(b.start, b.end, ws, we));

  await availDoc(uid).set(
    {
      weekly,
      busy,
      updatedAt: FieldValue.serverTimestamp(),
      adminWorkday: { start: ws, end: we },
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}
