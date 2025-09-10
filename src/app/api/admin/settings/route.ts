import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { sendEmail } from "@/lib/mailer";

export const runtime = "nodejs";

function initAdmin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON!;
    const creds = JSON.parse(raw);
    initializeApp({ credential: cert(creds) });
  }
}

async function requireAdmin(req: NextRequest) {
  const hdr = req.headers.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) throw new Error("Missing ID token");
  const dec = await getAdminAuth().verifyIdToken(token);
  const roles = (dec.roles as string[]) || [];
  if (!roles.includes("admin")) throw new Error("Not authorized");
  return dec.uid;
}

type Holiday = { date: string; name: string };

function sanitizeHolidays(input: unknown): Holiday[] {
  const arr = Array.isArray(input) ? input : [];
  const today = new Date(); today.setHours(0,0,0,0);
  const seen = new Set<string>();
  const out: Holiday[] = [];
  for (const raw of arr) {
    const date = String((raw as any)?.date ?? "").trim();
    const name = String((raw as any)?.name ?? "").trim();
    if (!date || !name) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const d = new Date(date + "T00:00:00");
    if (isNaN(d.getTime()) || d < today) continue;
    if (seen.has(date)) continue;
    seen.add(date);
    out.push({ date, name });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function userEmail(db: FirebaseFirestore.Firestore, uid: string): Promise<string | null> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    const v = snap.exists ? snap.data() : null;
    const email = (v?.email && String(v.email)) || null;
    return email;
  } catch {
    return null;
  }
}

export async function GET() {
  initAdmin();
  const db = getFirestore();
  const snap = await db.doc("settings/global").get();
  return NextResponse.json(
    snap.exists ? snap.data() : { workdayStart: "09:00", workdayEnd: "17:00", holidays: [] }
  );
}

export async function POST(req: NextRequest) {
  try {
    initAdmin();
    await requireAdmin(req);

    const body = await req.json();
    const workdayStart = String(body?.workdayStart || "09:00");
    const workdayEnd   = String(body?.workdayEnd   || "17:00");
    const holidays     = sanitizeHolidays(body?.holidays);

    if (!/^\d{2}:\d{2}$/.test(workdayStart) || !/^\d{2}:\d{2}$/.test(workdayEnd)) {
      throw new Error("Invalid time format for workday start/end");
    }

    const db = getFirestore();

    // save settings
    await db.doc("settings/global").set({ workdayStart, workdayEnd, holidays }, { merge: true });

    // Cancel future appointments violating new settings
    const now = new Date();
    const future = await db.collection("appointments")
      .where("startAt", ">", Timestamp.fromDate(now))
      .get();

    const holiSet = new Set(holidays.map(h => h.date));
    const [sH, sM] = workdayStart.split(":").map(Number);
    const [eH, eM] = workdayEnd.split(":").map(Number);

    let cancelled = 0;
    const batch = db.batch();

    // collect email sends (do *after* batch commit to avoid partial writes)
    const emailQueue: Array<Promise<any>> = [];

    future.forEach(doc => {
      const a = doc.data() as any;
      const s = a.startAt.toDate() as Date;

      const yyyy = s.getFullYear();
      const mm = String(s.getMonth() + 1).padStart(2, "0");
      const dd = String(s.getDate()).padStart(2, "0");
      const dayKey = `${yyyy}-${mm}-${dd}`;

      const inHoliday = holiSet.has(dayKey);
      const inHours =
        (s.getHours() > sH || (s.getHours() === sH && s.getMinutes() >= sM)) &&
        (s.getHours() < eH || (s.getHours() === eH && s.getMinutes() <= eM));

      if (inHoliday || !inHours) {
        cancelled++;
        const reason = inHoliday ? "Holiday" : "Outside organization working hours";
        batch.update(doc.ref, { status: "cancelled", cancelReason: reason });

        // in-app notifications
        const n = db.collection("notifications");
        batch.set(n.doc(), { toUid: a.studentId, text: "Your appointment was cancelled due to organization settings change.", createdAt: Timestamp.now() });
        batch.set(n.doc(), { toUid: a.teacherId, text: "An appointment was cancelled due to organization settings change.", createdAt: Timestamp.now() });

        // email notifications (queued)
        emailQueue.push(
          (async () => {
            const [studentEmail, teacherEmail] = await Promise.all([
              userEmail(db, a.studentId),
              userEmail(db, a.teacherId),
            ]);
            const when = s.toLocaleString();
            const subject = "Appointment cancelled – Organization settings updated";

            if (studentEmail) {
              await sendEmail({
                to: studentEmail,
                subject,
                html: `<p>Your appointment on <b>${when}</b> was cancelled.</p><p>Reason: <b>${reason}</b>.</p>`,
                text: `Your appointment on ${when} was cancelled. Reason: ${reason}.`,
              });
            }
            if (teacherEmail) {
              await sendEmail({
                to: teacherEmail,
                subject,
                html: `<p>An appointment on <b>${when}</b> was cancelled.</p><p>Reason: <b>${reason}</b>.</p>`,
                text: `An appointment on ${when} was cancelled. Reason: ${reason}.`,
              });
            }
          })()
        );
      }
    });

    if (cancelled) await batch.commit();
    
    await Promise.allSettled(emailQueue);

    return NextResponse.json({ ok: true, cancelled, saved: { workdayStart, workdayEnd, holidays } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
