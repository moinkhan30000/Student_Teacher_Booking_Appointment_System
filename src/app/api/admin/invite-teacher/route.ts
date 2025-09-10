import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth as getAdminAuth, UserRecord } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { sendEmail } from "@/lib/mailer";

export const runtime = "nodejs";


function initAdmin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set in .env.local");
    }
    const creds = JSON.parse(raw);
    initializeApp({ credential: cert(creds) });
  }
}


async function requireAdmin(req: NextRequest) {
  const hdr = req.headers.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) throw new Error("Missing ID token");

  const dec = await getAdminAuth().verifyIdToken(token);
  const roles: string[] = (dec.roles as string[]) || [];
  if (!roles.includes("admin")) throw new Error("Not authorized (admin only)");
  return dec.uid;
}

export async function POST(req: NextRequest) {
  try {
    initAdmin();
    await requireAdmin(req);

    const body = await req.json();

    const email = String(body?.email || "").trim().toLowerCase();
    const displayName = String(body?.displayName || "").trim();
    const department = String(body?.department || "").trim();
    const subject = String(body?.subject || "").trim();

    if (!email || !displayName) {
      throw new Error("email and displayName are required");
    }

    const auth = getAdminAuth();
    const db = getFirestore();

    // 1) Create or fetch user by email
    let user: UserRecord;
    try {
      user = await auth.getUserByEmail(email);
    } catch {
      // Create with a temporary strong password (will be replaced via reset link)
      const tempPassword = Math.random().toString(36).slice(2) + "A1!";
      user = await auth.createUser({
        email,
        emailVerified: false,
        password: tempPassword,
        displayName,
        disabled: false,
      });
    }

    // 2) Ensure "teacher" role is present
    const existingClaims = (user.customClaims as any) || {};
    const currentRoles: string[] = Array.isArray(existingClaims.roles)
      ? existingClaims.roles
      : [];
    const roles = Array.from(new Set([...currentRoles, "teacher"]));
    await auth.setCustomUserClaims(user.uid, { ...(existingClaims || {}), roles });

    // 3) Upsert Firestore docs
    await db.doc(`users/${user.uid}`).set(
      {
        displayName,
        email,
        roles,
        department: department || "",
        subject: subject || "",
        approved: true, // invited teachers are auto-approved
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    await db.doc(`teachers/${user.uid}`).set(
      {
        name: displayName,
        email,
        department: department || "",
        subject: subject || "",
        active: true,
        invitedAt: Timestamp.now(),
      },
      { merge: true }
    );

    // 4) Generate a password reset link & email it via SMTP mailer
    const resetLink = await auth.generatePasswordResetLink(email);

    // sendEmail uses your SMTP settings from .env.local via src/lib/mailer.ts
    await sendEmail({
      to: email,
      subject: "Set your password – Student-Teacher Booking",
      html: `
        <p>Hello ${displayName || "there"},</p>
        <p>You’ve been invited as a <b>Teacher</b>. Click the button below to set your password:</p>
        <p>
          <a href="${resetLink}"
             style="background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">
            Set Password
          </a>
        </p>
        <p>If the button doesn’t work, copy this link into your browser:<br/>
        <a href="${resetLink}">${resetLink}</a></p>
      `,
      text: `Set your password: ${resetLink}`,
    });

    return NextResponse.json({
      ok: true,
      uid: user.uid,
      email,
      roles,
      resetLink,
      message: "Teacher invited and reset email sent.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to invite teacher" },
      { status: 400 }
    );
  }
}
