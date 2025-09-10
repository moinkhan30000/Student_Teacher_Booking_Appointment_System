"use client";

import { useEffect, useState } from "react";
import { RequireRoles } from "@/lib/guards";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Row = {
  uid: string;
  displayName: string;
  email: string;
  department: string;
  subject: string;
  status: "Active" | "Invited";
};

export default function AdminTeachersPage() {
  return (
    <RequireRoles roles={["admin"]}>
      <TeachersInner />
    </RequireRoles>
  );
}

function TeachersInner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invDept, setInvDept] = useState("");
  const [invSubject, setInvSubject] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [lastResetLink, setLastResetLink] = useState<string | null>(null);

  // Delete confirm
  const [delOpen, setDelOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      // Active (users with teacher role)
      const uq = query(collection(db, "users"), where("roles", "array-contains", "teacher"));
      const uSnap = await getDocs(uq);
      const active: Row[] = uSnap.docs.map((d) => {
        const v: any = d.data();
        return {
          uid: d.id,
          displayName: v.displayName || "",
          email: v.email || "",
          department: v.department || "",
          subject: v.subject || "",
          status: "Active",
        };
      });

      // Invited (from teachers collection) not already in active
      const tSnap = await getDocs(collection(db, "teachers"));
      const invited: Row[] = tSnap.docs
        .filter((td) => !active.find((a) => a.uid === td.id))
        .map((td) => {
          const t: any = td.data();
          return {
            uid: td.id,
            displayName: t.name || "",
            email: t.email || "",
            department: t.department || "",
            subject: t.subject || "",
            status: "Invited",
          };
        });

      const merged = [...active, ...invited].sort((a, b) =>
        (a.displayName || a.email || a.uid).localeCompare(
          b.displayName || b.email || b.uid
        )
      );

      setRows(merged);
    } catch (e: any) {
      toast.error(e.message || "Failed to load teachers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function inviteTeacher() {
    if (!invEmail || !invName) {
      return toast.warning("Name and email are required");
    }
    setInviting(true);
    setLastResetLink(null);
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/admin/invite-teacher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email: invEmail,
          displayName: invName,
          department: invDept,
          subject: invSubject,
          sendEmail, // << send reset email via Resend on the server
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to invite");
      setLastResetLink(data.resetLink || null);
      toast.success(
        data.emailed ? "Invite sent by email" : "Teacher invited (reset link copied)"
      );
      setInvEmail("");
      setInvName("");
      setInvDept("");
      setInvSubject("");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setInviting(false);
    }
  }

  function askDelete(row: Row) {
    setDelTarget(row);
    setDelOpen(true);
  }

  async function confirmDelete() {
    if (!delTarget) return;
    setDeleting(true);
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/admin/delete-teacher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ teacherUid: delTarget.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(
        data.cancelled
          ? `Deleted. ${data.cancelled} future appointment(s) cancelled.`
          : "Deleted teacher."
      );
      setDelOpen(false);
      setDelTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Teachers</h1>

      {/* Invite form */}
      <Card className="p-4 space-y-3">
        <div className="text-lg font-medium">Invite / Add Teacher</div>
        <div className="grid md:grid-cols-4 gap-3">
          <Input placeholder="Name" value={invName} onChange={(e) => setInvName(e.target.value)} />
          <Input placeholder="Email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
          <Input placeholder="Department" value={invDept} onChange={(e) => setInvDept(e.target.value)} />
          <Input placeholder="Subject" value={invSubject} onChange={(e) => setInvSubject(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />
            Send password reset link by email
          </label>
          <Button onClick={inviteTeacher} disabled={inviting}>
            {inviting ? "Inviting…" : "Invite"}
          </Button>
        </div>
        {lastResetLink && (
          <div className="text-sm">
            Reset link (copy/share if needed):{" "}
            <a className="text-blue-600 underline" href={lastResetLink}>
              {lastResetLink}
            </a>
          </div>
        )}
      </Card>

      {/* List */}
      <Card className="p-4">
        {loading ? (
          <div className="text-sm text-neutral-600">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-neutral-600">No teachers yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-600">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Subject</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((t) => (
                  <tr key={t.uid}>
                    <td className="py-2 pr-4">{t.displayName || "—"}</td>
                    <td className="py-2 pr-4">{t.email || "—"}</td>
                    <td className="py-2 pr-4">{t.department || "—"}</td>
                    <td className="py-2 pr-4">{t.subject || "—"}</td>
                    <td className="py-2 pr-4">{t.status}</td>
                    <td className="py-2 pr-2 text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => askDelete(t)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={delOpen}
        title="Delete teacher?"
        description={
          <>
            This will remove{" "}
            <span className="font-medium">
              {delTarget?.displayName || delTarget?.email}
            </span>
            {" "}and cancel their future appointments. This cannot be undone.
          </>
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) {
            setDelOpen(false);
            setDelTarget(null);
          }
        }}
      />
    </div>
  );
}
