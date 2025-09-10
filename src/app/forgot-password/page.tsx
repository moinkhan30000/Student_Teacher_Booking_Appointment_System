"use client";

import { useState } from "react";
import { sendPasswordResetEmail, ActionCodeSettings } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function reset() {
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
      toast.success("Password reset email sent");
    } catch (e: any) {
      toast.error(e?.message || "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid place-items-center min-h-[60vh]">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <Input
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") reset();
          }}
        />
        <Button onClick={reset} disabled={busy} className="w-full">
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </Card>
    </div>
  );
}
