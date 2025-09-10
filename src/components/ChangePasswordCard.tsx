"use client";

import { useState } from "react";
import { getAuth, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { checkPassword, passwordChecklist } from "@/lib/password";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ChangePasswordCard() {
  const auth = getAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = checkPassword(next).ok;

  async function submit() {
    try {
      setBusy(true);
      const u = auth.currentUser;
      if (!u || !u.email) throw new Error("Not signed in");
      const cred = EmailAuthProvider.credential(u.email, current);
      await reauthenticateWithCredential(u, cred);
      if (!valid) { toast.error("Please meet the requirements."); return; }
      await updatePassword(u, next);
      await setDoc(doc(db, "users", u.uid), { pwCompliant: true }, { merge: true });
      setCurrent(""); setNext("");
      toast.success("Password updated.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to change password");
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="font-medium">Change password</div>
      <Input type="password" placeholder="Current password" value={current} onChange={(e)=>setCurrent(e.target.value)} />
      <Input type="password" placeholder="New password" value={next} onChange={(e)=>setNext(e.target.value)} />
      <div dangerouslySetInnerHTML={{ __html: passwordChecklist(next) }} />
      <Button onClick={submit} disabled={busy || !valid}>Update password</Button>
    </Card>
  );
}
