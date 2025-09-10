import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";

function initAdmin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON!;
    const creds = JSON.parse(raw);
    initializeApp({ credential: cert(creds) });
  }
}

export async function GET(req: NextRequest) {
  try {
    initAdmin();
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get("teacherId");
    const date = searchParams.get("date"); // YYYY-MM-DD

    if (!teacherId || !date) throw new Error("teacherId and date required");

    const db = getFirestore();

    // busy blocks (publicly readable, but fetch server-side)
    const busySnap = await db.collection(`teachers/${teacherId}/busy`)
      .where("date","==", date).get();
    const busy = busySnap.docs.map(d => d.data());

    // Approved and pending appts on that date (server has access)
    const start = new Date(`${date}T00:00:00`);
    const end   = new Date(`${date}T23:59:59`);
    const apSnap = await db.collection("appointments")
      .where("teacherId","==", teacherId)
      .where("startAt",">=", Timestamp.fromDate(start))
      .where("startAt","<=", Timestamp.fromDate(end))
      .get();
    const appointments = apSnap.docs
      .map(d => d.data() as any)
      .filter(a => a.status !== "cancelled" && a.status !== "rejected")
      .map(a => ({
        start: a.startAt.toDate().toISOString(),
        end: a.endAt.toDate().toISOString(),
        status: a.status,
      }));

    return NextResponse.json({ busy, appointments });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
