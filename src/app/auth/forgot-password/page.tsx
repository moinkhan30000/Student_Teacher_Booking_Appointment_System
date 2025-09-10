"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail, ActionCodeSettings } from "firebase/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return toast.warning("Enter your email");
    setBusy(true);
    try {
    
      const origin =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const continueUrl = `${origin}/auth/reset-done?email=${encodeURIComponent(
        email.trim()
      )}`;

      const actionCodeSettings: ActionCodeSettings = {
        url: continueUrl,
        handleCodeInApp: false, 
      };

      localStorage.setItem("lastResetEmail", email.trim());
      await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings);
      toast.success(
        "If an account exists, a reset email has been sent. Check Inbox/Spam."
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-center">
      <Card className="p-6 w-full max-w-md">
        <h1 className="text-xl font-semibold mb-4">Reset your password</h1>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <div className="text-sm mb-1">Email</div>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(e);
              }}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <div className="text-sm mt-4">
          <Link className="text-blue-600 underline" href="/">
            Back to sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}
