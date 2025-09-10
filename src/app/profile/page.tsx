"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useUser } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getAuth,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { isAdmin, isTeacher } from "@/lib/roles";
import PasswordChecklist from "@/components/PasswordChecklist";
import { isCompliant } from "@/lib/passwordPolicy";

export default function ProfilePage() {
  const { uid, email, roles, approved, displayName: authDisplayName } = useUser();

  const roleView = useMemo<"admin" | "teacher" | "student">(() => {
    if (isAdmin(roles)) return "admin";
    if (isTeacher(roles)) return "teacher";
    return "student";
  }, [roles]);

  // Profile fields
  const [displayName, setDisplayName] = useState(authDisplayName || "");
  const [department, setDepartment] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);

  // Password change fields
  const [currPw, setCurrPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [busyPw, setBusyPw] = useState(false);

  useEffect(() => {
    (async () => {
      if (!uid) return;
      const snap = await getDoc(doc(db, "users", uid));
      const d: any = snap.data() || {};
      setDisplayName(typeof d.displayName === "string" ? d.displayName : (authDisplayName ?? ""));
      setDepartment(d.department ?? "");
      setSubject(d.subject ?? "");
    })();
    
  }, [uid]);

  async function saveProfile(e?: FormEvent) {
    e?.preventDefault();
    if (!uid) return;
    setBusy(true);
    try {
      const payload: any = { displayName };
      if (roleView === "teacher") {
        payload.department = department;
        payload.subject = subject;
      } else if (roleView === "student") {
        payload.department = department;
      }
      await updateDoc(doc(db, "users", uid), payload);
      toast.success("Profile updated");
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function changePw(e: FormEvent) {
    e.preventDefault();
    try {
      if (!email) return toast.error("No email on account.");
      if (newPw !== newPw2) return toast.warning("Passwords do not match.");
      if (!isCompliant(newPw)) return toast.warning("Please meet all password requirements.");

      const au = getAuth();
      const user = au.currentUser;
      if (!user) return toast.error("Not signed in.");

      // re-authenticate with current password
      const cred = EmailAuthProvider.credential(email, currPw);
      setBusyPw(true);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);

      // mark as compliant
      await updateDoc(doc(db, "users", user.uid), { pwCompliant: true });

      setCurrPw("");
      setNewPw("");
      setNewPw2("");
      toast.success("Password updated");
    } catch (e: any) {
      toast.error(e?.message || "Could not change password");
    } finally {
      setBusyPw(false);
    }
  }

  if (!uid) return <p className="text-sm text-neutral-600">Please sign in.</p>;

  return (
    <div className="container py-8 grid gap-6 md:grid-cols-2">
      {/* Profile card */}
      <Card className="p-5 space-y-3">
        <div className="text-lg font-semibold">Your Profile</div>
        <div className="text-sm text-neutral-600">Email: {email || "-"}</div>

        <form className="space-y-3" onSubmit={saveProfile}>
          <Input
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          {/* Role-specific fields */}
          {roleView === "teacher" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                placeholder="Department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
              <Input
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          )}

          {roleView === "student" && (
            <Input
              placeholder="Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          )}

          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
              approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {approved ? "Approved" : "Pending Approval"}
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Change password card */}
      <Card className="p-5 space-y-3">
        <div className="text-lg font-semibold">Change Password</div>
        <form className="space-y-3" onSubmit={changePw}>
          <Input
            type="password"
            placeholder="Current password"
            value={currPw}
            onChange={(e) => setCurrPw(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Input
            type="password"
            placeholder="New password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            required
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={newPw2}
            onChange={(e) => setNewPw2(e.target.value)}
            required
            autoComplete="new-password"
          />

          {/* Live policy checklist */}
          <PasswordChecklist value={newPw} />

          <div className="flex justify-end">
            <Button type="submit" disabled={busyPw}>
              {busyPw ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
