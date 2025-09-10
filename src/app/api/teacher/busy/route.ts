import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";

function initAdmin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON!;
    const creds = JSON.parse(raw);
    initializeApp({ credential: cert(creds) });
  }
}
async function requireTeacher(req: NextRequest) {
  const hdr = req.headers.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) throw new Error("Missing ID token");
  const dec = await getAdminAuth().verifyIdToken(token);
  const roles = (dec.roles as string[]) || [];
  if (!roles.includes("teacher") && !roles.includes("admin")) throw new Error("Not authorized");
  return dec.uid;
}

// List
export async function GET(req: NextRequest) {
  try {
    initAdmin();
    const uid = await requireTeacher(req);
    const db = getFirestore();
    const snap = await db.collection(`teachers/${uid}/busy`).get();
    const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    return NextResponse.json({ items });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}

// Add
export async function POST(req: NextRequest) {
  try {
    initAdmin();
    const uid = await requireTeacher(req);
    const { date, start, end, reason } = await req.json();
    if (!date || !start || !end) throw new Error("date, start, end required");
    const d = new Date(date + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);
    if (d < today) throw new Error("Past dates not allowed");

    const db = getFirestore();
    await db.collection(`teachers/${uid}/busy`).add({
      date, start, end, reason: reason ?? "", createdAt: Timestamp.now(), createdBy: uid
    });

    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}

// Delete
export async function DELETE(req: NextRequest) {
  try {
    initAdmin();
    const uid = await requireTeacher(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("id required");
    const db = getFirestore();
    await db.doc(`teachers/${uid}/busy/${id}`).delete();
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 400 });
  }
}
