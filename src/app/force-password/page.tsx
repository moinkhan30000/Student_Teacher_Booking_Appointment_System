"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import PasswordChecklist from "@/components/PasswordChecklist";
import { isCompliant } from "@/lib/passwordPolicy";

export default function ForcePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      router.replace("/");
      return;
    }
    // If already compliant, bounce back
    (async () => {
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists() && (snap.data() as any)?.pwCompliant === true) {
        router.replace("/dashboard");
      }
    })();
  }, [router]);

  async function submit() {
    try {
      setBusy(true);
      const u = auth.currentUser;
      if (!u || !u.email) throw new Error("Not signed in");
      if (!isCompliant(next)) {
        toast.error("Please meet all password requirements.");
        return;
      }
      // re-authenticate
      const cred = EmailAuthProvider.credential(u.email, current);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, next);

      // mark compliant
      await setDoc(
        doc(db, "users", u.uid),
        { pwCompliant: true },
        { merge: true }
      );

      toast.success("Password updated.");
      router.replace("/dashboard");
    } catch (e: any) {
      toast.error(e?.message || "Failed to change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container py-8 grid place-items-center">
      <Card className="p-6 w-full max-w-lg space-y-3">
        <h1 className="text-xl font-semibold">Update your password</h1>
        <p className="text-sm text-neutral-600">
          Your account needs a stronger password before you continue.
        </p>

        <Input
          type="password"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Input
          type="password"
          placeholder="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />

        {/* Live policy checklist */}
        <PasswordChecklist value={next} />

        <div className="flex justify-end">
          <Button onClick={submit} disabled={busy}>
            {busy ? "Please wait…" : "Update password"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
