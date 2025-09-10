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

async function userEmail(db: FirebaseFirestore.Firestore, uid: string): Promise<string | null> {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    const v = snap.exists ? snap.data() : null;
    return (v?.email && String(v.email)) || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    initAdmin();
    await requireAdmin(req);

    const body = await req.json();
    const teacherUid: string = String(body?.teacherUid || "").trim();
    if (!teacherUid) throw new Error("teacherUid required");

    const db = getFirestore();
    const auth = getAdminAuth();


    const teacherEmail = await userEmail(db, teacherUid);

    // 1) Cancel teacher's future appointments
    const now = new Date();
    const apSnap = await db
      .collection("appointments")
      .where("teacherId", "==", teacherUid)
      .where("startAt", ">", Timestamp.fromDate(now))
      .get();

    let cancelled = 0;
    const batch = db.batch();

    // Queue emails to students (+ optional teacher)
    const emailQueue: Array<Promise<any>> = [];

    apSnap.forEach((doc) => {
      const a: any = doc.data();
      if (a.status !== "cancelled") {
        cancelled++;
        batch.update(doc.ref, {
          status: "cancelled",
          cancelReason: "Teacher account removed",
        });
        // in-app notify student
        batch.set(db.collection("notifications").doc(), {
          toUid: a.studentId,
          text: "Your appointment was cancelled because the teacher account was removed.",
          createdAt: Timestamp.now(),
        });

        // email student
        emailQueue.push(
          (async () => {
            const studentEmail = await userEmail(db, a.studentId);
            if (!studentEmail) return;
            const when = (a.startAt as Timestamp).toDate().toLocaleString();
            await sendEmail({
              to: studentEmail,
              subject: "Appointment cancelled – Teacher removed",
              html: `<p>Your appointment on <b>${when}</b> was cancelled because the teacher's account was removed by the administrator.</p>`,
              text: `Your appointment on ${when} was cancelled because the teacher's account was removed by the administrator.`,
            });
          })()
        );
      }
    });

    // 2) Delete teacher busy subcollection
    const busyCol = await db.collection(`teachers/${teacherUid}/busy`).get();
    busyCol.forEach((d) => batch.delete(d.ref));

    // 3) Delete teacher profile doc and user doc
    batch.delete(db.doc(`teachers/${teacherUid}`));
    batch.delete(db.doc(`users/${teacherUid}`));

    await batch.commit();


    try {
      await auth.revokeRefreshTokens(teacherUid);
      await auth.deleteUser(teacherUid);
    } catch {

    }

 
    if (teacherEmail) {
      emailQueue.push(
        sendEmail({
          to: teacherEmail,
          subject: "Your teacher account was removed",
          html: `<p>Your teacher account has been removed by the administrator. Future appointments were cancelled.</p>`,
          text: `Your teacher account has been removed by the administrator. Future appointments were cancelled.`,
        })
      );
    }

    await Promise.allSettled(emailQueue);

    return NextResponse.json({ ok: true, cancelled });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
