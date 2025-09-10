"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/Confirm";

type Row = {
  id: string;
  studentId: string;
  teacherId: string;
  startAt: Timestamp;
  endAt: Timestamp;
  status: "pending" | "approved" | "cancelled";
  note?: string;
};

type UserLite = { displayName?: string; department?: string; email?: string };

export default function ManageRequestsPage() {
  const router = useRouter();
  const { uid, roles, loading } = useUser();

  const isTeacher = !!uid && roles?.includes("teacher");
  const isAdmin = roles?.includes("admin");

  const [pending, setPending] = useState<Row[]>([]);
  const [upcoming, setUpcoming] = useState<Row[]>([]);
  const [uMap, setUMap] = useState<Record<string, UserLite>>({});
  const [hydratingUsers, setHydratingUsers] = useState(false);

  // confirm state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState<{ id: string; action: "approve" | "reject" | "cancel"; title: string; desc?: string; tone?: "destructive" | "default"; } | null>(null);

  // Guard
  useEffect(() => {
    if (loading) return;
    if (!uid || (!isTeacher && !isAdmin)) {
      router.replace("/");
    }
  }, [uid, loading, isTeacher, isAdmin, router]);

  // Live listeners
  useEffect(() => {
    if (!uid) return;

    const now = new Date();

    const qPending = query(
      collection(db, "appointments"),
      where("teacherId", "==", uid),
      where("status", "==", "pending"),
      where("startAt", ">=", Timestamp.fromDate(now)),
      orderBy("startAt", "asc")
    );

    const qUpcoming = query(
      collection(db, "appointments"),
      where("teacherId", "==", uid),
      where("status", "==", "approved"),
      where("startAt", ">=", Timestamp.fromDate(now)),
      orderBy("startAt", "asc")
    );

    const unsub1 = onSnapshot(
      qPending,
      (snap) => {
        const rows: Row[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
        setPending(rows);
      },
      (err) => {
        console.warn(err);
        toast.error("Failed to load pending requests");
      }
    );

    const unsub2 = onSnapshot(
      qUpcoming,
      (snap) => {
        const rows: Row[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
        setUpcoming(rows);
      },
      (err) => {
        console.warn(err);
        toast.error("Failed to load upcoming");
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [uid]);

  // Hydrate student names/departments whenever row sets change
  useEffect(() => {
    const ids = new Set<string>([...pending, ...upcoming].map((r) => r.studentId));
    if (ids.size === 0) {
      setUMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      setHydratingUsers(true);
      const entries: [string, UserLite][] = [];
      for (const sid of ids) {
        try {
          const usnap = await getDoc(doc(db, "users", sid));
          if (usnap.exists()) {
            const d = usnap.data() as any;
            entries.push([
              sid,
              {
                displayName: d.displayName || d.name,
                department: d.department,
                email: d.email,
              },
            ]);
          } else {
            entries.push([sid, {}]);
          }
        } catch {
          entries.push([sid, {}]);
        }
      }
      if (!cancelled) {
        const next: Record<string, UserLite> = {};
        for (const [k, v] of entries) next[k] = v;
        setUMap(next);
        setHydratingUsers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pending, upcoming]);

  function ask(id: string, action: "approve" | "reject" | "cancel") {
    setConfirmCfg({
      id,
      action,
      title:
        action === "approve"
          ? "Approve this request?"
          : action === "reject"
          ? "Reject this request?"
          : "Cancel this appointment?",
      desc:
        action === "approve"
          ? "Other pending requests for the same time will be auto-rejected."
          : action === "reject"
          ? "The student will be notified by email."
          : "The student will be notified by email.",
      tone: action === "reject" || action === "cancel" ? "destructive" : "default",
    });
    setConfirmOpen(true);
  }

  async function doAction() {
    if (!confirmCfg) return;
    try {
      const idToken = await getAuth().currentUser!.getIdToken(true);
      const res = await fetch("/api/appointments/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ id: confirmCfg.id, action: confirmCfg.action }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Failed");
      // live updates via onSnapshot
    } catch (e: any) {
      toast.error(e?.message || "Action failed");
    }
  }

  function rowLine(r: Row) {
    const s = (r.startAt as Timestamp).toDate();
    const e = (r.endAt as Timestamp).toDate();
    return `${s.toLocaleDateString()} • ${String(s).slice(16, 21)}–${String(e).slice(16, 21)}`;
  }

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Manage requests (live)</h1>
        <p className="text-sm text-neutral-600 mt-1">Approve, reject, or cancel upcoming appointments. Emails are sent automatically.</p>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pending</h2>
          {hydratingUsers && <div className="text-xs text-neutral-500">Refreshing users…</div>}
        </div>

        {pending.length === 0 ? (
          <div className="text-sm text-neutral-500 mt-2">No pending requests.</div>
        ) : (
          <div className="divide-y mt-2">
            {pending.map((r) => {
              const u = uMap[r.studentId] || {};
              return (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                  <div className="text-sm">
                    <div className="font-medium">
                      {u.displayName || r.studentId}
                      {u.department ? ` · ${u.department}` : ""}
                    </div>
                    <div className="text-neutral-600">{rowLine(r)}</div>
                    {u.email && <div className="text-neutral-500 text-xs">{u.email}</div>}
                    {r.note && <div className="text-neutral-600 text-xs mt-1">Note: {r.note}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => ask(r.id, "approve")}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => ask(r.id, "reject")}>Reject</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">Upcoming (approved)</h2>

        {upcoming.length === 0 ? (
          <div className="text-sm text-neutral-500 mt-2">No upcoming appointments.</div>
        ) : (
          <div className="divide-y mt-2">
            {upcoming.map((r) => {
              const u = uMap[r.studentId] || {};
              return (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
                  <div className="text-sm">
                    <div className="font-medium">
                      {u.displayName || r.studentId}
                      {u.department ? ` · ${u.department}` : ""}
                    </div>
                    <div className="text-neutral-600">{rowLine(r)}</div>
                    {u.email && <div className="text-neutral-500 text-xs">{u.email}</div>}
                    {r.note && <div className="text-neutral-600 text-xs mt-1">Note: {r.note}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => ask(r.id, "cancel")}>Cancel</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmCfg?.title}
        description={confirmCfg?.desc}
        tone={confirmCfg?.tone}
        confirmText={
          confirmCfg?.action === "approve"
            ? "Approve"
            : confirmCfg?.action === "reject"
            ? "Reject"
            : "Cancel"
        }
        onConfirm={doAction}
      />
    </div>
  );
}
