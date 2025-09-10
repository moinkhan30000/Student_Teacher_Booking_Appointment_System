import nodemailer from "nodemailer";

/**
 * SMTP-first mailer.
 * - If SMTP_USER/PASS are set, uses Gmail SMTP (or any SMTP).
 * - Otherwise (optional), falls back to Resend if RESEND_API_KEY exists.
 * - Else throws a clear error.
 */

async function sendViaSMTP({
  to, subject, html, text,
}: { to: string; subject: string; html?: string; text?: string }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error("SMTP is not fully configured (need SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM).");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html: html || (text ? `<pre>${text}</pre>` : undefined),
    text,
  });

  // Optional: log messageId for debugging
  console.log("[mailer] SMTP sent:", info.messageId);
  return { id: info.messageId };
}

async function sendViaResend({
  to, subject, html, text,
}: { to: string; subject: string; html?: string; text?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Student-Teacher Booking <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY is not set for Resend fallback.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html: html || `<pre>${text || ""}</pre>`, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[mailer] Resend API error:", res.status, body);
    throw new Error(`Resend error ${res.status}: ${body || "Unknown"}`);
  }
  const json = await res.json().catch(() => ({}));
  console.log("[mailer] Resend sent:", json?.id);
  return json;
}

export async function sendEmail(args: { to: string; subject: string; html?: string; text?: string }) {
  const hasSMTP = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  if (hasSMTP) return sendViaSMTP(args);

  if (process.env.RESEND_API_KEY) {
    // Optional fallback if you left Resend configured
    return sendViaResend(args);
  }

  throw new Error("No email provider configured. Set SMTP_* env vars (recommended) or RESEND_API_KEY.");
}
