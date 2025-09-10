import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/mailer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const to = new URL(req.url).searchParams.get("to");
    if (!to) return NextResponse.json({ error: "Add ?to=arshadalikhan30000@gmail.com" }, { status: 400 });

    const data = await sendEmail({
      to,
      subject: "SMTP test ✅",
      html: `<h2>SMTP test from Student-Teacher Booking</h2><p>If you see this, SMTP works 🎉</p>`,
      text: "SMTP test",
    });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
