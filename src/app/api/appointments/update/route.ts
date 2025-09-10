import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, FieldValue, WriteBatch } from "firebase-admin/firestore";
import { sendEmail } from "@/lib/mailer";

export const runtime = "nodejs";

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

function timeEq(a: Date, b: Date) {
  return a.getTime() === b.getTime();
}
function fmtDateTime(s: Date, e: Date) {
  const d = s.toLocaleDateString();
  const t = `${String(s).slice(16,21)}–${String(e).slice(16,21)}`;
  return `${d} ${t}`;
}

async function hydrateUsers(studentId: string, teacherId: string) {
  const [sDoc, tDoc] = await Promise.all([
    db.collection("users").doc(studentId).get(),
    db.collection("users").doc(teacherId).get(),
  ]);
  const s = sDoc.data() || {};
  const t = tDoc.data() || {};
  return {
    student: { email: s.email as string | undefined, name: (s.displayName || s.name || "Student") as string },
    teacher: { email: t.email as string | undefined, name: (t.displayName || t.name || "Teacher") as string },
  };
}

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const roles: string[] = (decoded as any).roles || [];

    const body = await req.json();
    const action: "approve" | "reject" | "cancel" = body?.action;
    const id: string = String(body?.id || "");
    const note: string | undefined = typeof body?.note === "string" ? body.note : undefined;

    if (!id || !action) return NextResponse.json({ error: "Missing id/action" }, { status: 400 });

    const ref = db.collection("appointments").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const a = snap.data() as any;

    const isTeacher = roles.includes("teacher") && a.teacherId === uid;
    const isStudent = a.studentId === uid && !roles.includes("teacher") && !roles.includes("admin");
    const isAdmin = roles.includes("admin");

    const s = (a.startAt as Timestamp).toDate();
    const e = (a.endAt as Timestamp).toDate();
    const slotText = fmtDateTime(s, e);
    const { student, teacher } = await hydrateUsers(a.studentId, a.teacherId);

    if (action === "approve") {
      if (!isTeacher && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (a.status !== "pending") return NextResponse.json({ error: "Not pending" }, { status: 400 });

      // Ensure no overlap with already-approved
      const dayISO = s.toISOString().slice(0,10);
      const dayStart = new Date(`${dayISO}T00:00:00`);
      const dayEnd = new Date(`${dayISO}T23:59:59`);

      const approvedSameDay = await db.collection("appointments")
        .where("teacherId", "==", a.teacherId)
        .where("status", "==", "approved")
        .where("startAt", ">=", Timestamp.fromDate(dayStart))
        .where("startAt", "<=", Timestamp.fromDate(dayEnd))
        .get();

      const overlapsApproved = approvedSameDay.docs.some(d => {
        const x = d.data() as any;
        const xs = (x.startAt as Timestamp).toDate();
        const xe = (x.endAt as Timestamp).toDate();
        return !(e <= xs || xe <= s);
      });
      if (overlapsApproved) return NextResponse.json({ error: "Overlaps an approved appointment" }, { status: 409 });

      // Approve + auto-reject same-slot pending
      const batch: WriteBatch = db.batch();
      batch.update(ref, { status: "approved", note: note ?? a.note, updatedAt: FieldValue.serverTimestamp() });

      const pendingSameDay = await db.collection("appointments")
        .where("teacherId", "==", a.teacherId)
        .where("status", "==", "pending")
        .where("startAt", ">=", Timestamp.fromDate(dayStart))
        .where("startAt", "<=", Timestamp.fromDate(dayEnd))
        .get();

      const toNotifyAutoReject: string[] = [];
      pendingSameDay.docs.forEach(doc => {
        if (doc.id === id) return;
        const p = doc.data() as any;
        const ps = (p.startAt as Timestamp).toDate();
        const pe = (p.endAt as Timestamp).toDate();
        if (timeEq(ps, s) && timeEq(pe, e)) {
          batch.update(doc.ref, {
            status: "cancelled",
            note: "Auto-rejected: another request for this slot was approved.",
            updatedAt: FieldValue.serverTimestamp(),
          });
          toNotifyAutoReject.push(p.studentId);
        }
      });

      await batch.commit();

      // Emails
      if (student.email) {
        await sendEmail({
          to: student.email,
          subject: "Appointment Approved",
          html: `<p>Hi ${student.name},</p><p>Your appointment with ${teacher.name} on <b>${slotText}</b> has been <b>approved</b>.</p>`,
        });
      }
      if (toNotifyAutoReject.length) {
        const uniq = Array.from(new Set(toNotifyAutoReject));
        await Promise.all(
          uniq.map(async sid => {
            const u = await db.collection("users").doc(sid).get();
            const em = u.data()?.email as string | undefined;
            const nm = (u.data()?.displayName || u.data()?.name || "Student") as string;
            if (em) {
              await sendEmail({
                to: em,
                subject: "Appointment Request Not Selected",
                html: `<p>Hi ${nm},</p><p>Your request for <b>${slotText}</b> was not selected because another request for the same time was approved.</p>`,
              });
            }
          })
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "reject") {
      if (!isTeacher && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (a.status !== "pending") return NextResponse.json({ error: "Not pending" }, { status: 400 });
      await ref.update({ status: "cancelled", note: note ?? a.note, updatedAt: FieldValue.serverTimestamp() });

      if (student.email) {
        await sendEmail({
          to: student.email,
          subject: "Appointment Rejected",
          html: `<p>Hi ${student.name},</p><p>Your appointment request with ${teacher.name} on <b>${slotText}</b> was <b>rejected</b>.</p>`,
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "cancel") {
      // Student, teacher, or admin can cancel 
      const isCancellingTeacher = isTeacher || (isAdmin && roles.includes("teacher")); 
      const isCancellingStudent = isStudent;
      const isCancellingAdmin = isAdmin;

      if (!isCancellingTeacher && !isCancellingStudent && !isCancellingAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (s <= new Date() && !isAdmin) {
        return NextResponse.json({ error: "Past appointments cannot be cancelled" }, { status: 400 });
      }

      await ref.update({ status: "cancelled", note: note ?? a.note, updatedAt: FieldValue.serverTimestamp() });

      // Emails:
      if (isCancellingTeacher && student.email) {
        await sendEmail({
          to: student.email,
          subject: "Appointment Cancelled by Teacher",
          html: `<p>Hi ${student.name},</p><p>Your appointment on <b>${slotText}</b> was <b>cancelled</b> by ${teacher.name}.</p>`,
        });
      } else if (isCancellingStudent && teacher.email) {
        await sendEmail({
          to: teacher.email,
          subject: "Student Cancelled Appointment",
          html: `<p>Hi ${teacher.name},</p><p>An appointment on <b>${slotText}</b> was <b>cancelled</b> by ${student.name}.</p>`,
        });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
