"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/lib/auth";
import { isAdmin, isTeacher } from "@/lib/roles";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { uid, roles, approved } = useUser();

  const role: "admin" | "teacher" | "student" = useMemo(() => {
    if (isAdmin(roles)) return "admin";
    if (isTeacher(roles)) return "teacher";
    return "student";
  }, [roles]);

  if (!uid) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {role === "admin" && <AdminHome />}
      {role === "teacher" && <TeacherHome uid={uid} />}
      {role === "student" && <StudentHome uid={uid} approved={approved} />}
    </div>
  );
}

/* ------------------------ ADMIN HOME ------------------------ */
function AdminHome() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    (async () => {
      const qs = query(
        collection(db, "users"),
        where("approved", "==", false)
      );
      const snap = await getDocs(qs);
      setPendingCount(snap.size);
    })();
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5 space-y-2">
        <div className="text-lg font-semibold">User Administration</div>
        <p className="text-sm text-neutral-600">
          Approve students and manage roles.
        </p>
        <div className="flex items-center gap-3">
          <Link href="/admin/users">
            <Button>Review Users</Button>
          </Link>
          <span className="text-sm text-neutral-600">
            Pending approvals: <b>{pendingCount}</b>
          </span>
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <div className="text-lg font-semibold">Teachers</div>
        <p className="text-sm text-neutral-600">
          Add teachers or invite by email (password setup link).
        </p>
        <Link href="/admin/teachers">
          <Button>Manage Teachers</Button>
        </Link>
      </Card>
    </div>
  );
}

/* ------------------------ TEACHER HOME ------------------------ */
function TeacherHome({ uid }: { uid: string }) {
  const [today, setToday] = useState<any[]>([]);
  const [pending, setPending] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      // Today’s appointments
      const qs = query(
        collection(db, "appointments"),
        where("teacherId", "==", uid),
        where("startAt", ">=", Timestamp.fromDate(start)),
        where("startAt", "<=", Timestamp.fromDate(end)),
        orderBy("startAt", "asc")
      );
      const snap = await getDocs(qs);
      setToday(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

      // Pending count
      const qp = query(
        collection(db, "appointments"),
        where("teacherId", "==", uid),
        where("status", "==", "pending")
      );
      const spp = await getDocs(qp);
      setPending(spp.size);
    })();
  }, [uid]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5 space-y-2">
        <div className="text-lg font-semibold">Requests</div>
        <p className="text-sm text-neutral-600">
          Approve or reject student requests.
        </p>
        <div className="flex items-center gap-3">
          <Link href="/appointments/manage">
            <Button>Manage Requests</Button>
          </Link>
          <span className="text-sm text-neutral-600">
            Pending: <b>{pending}</b>
          </span>
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <div className="text-lg font-semibold">Today’s Schedule</div>
        <ul className="space-y-2">
          {today.length === 0 && (
            <li className="text-sm text-neutral-600">No appointments today.</li>
          )}
          {today.map(a => (
            <li key={a.id} className="flex justify-between">
              <span>
                {new Date(a.startAt.seconds * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                —{" "}
                {new Date(a.endAt.seconds * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="capitalize">{a.status}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------ STUDENT HOME ------------------------ */
function StudentHome({ uid, approved }: { uid: string; approved: boolean }) {
  const [recent, setRecent] = useState<any[]>([]);
  const [noti, setNoti] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      // Recent appointments (last 5)
      const qa = query(
        collection(db, "appointments"),
        where("studentId", "==", uid),
        orderBy("startAt", "desc"),
        limit(5)
      );
      const sa = await getDocs(qa);
      setRecent(sa.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

      // Latest notifications (last 5)
      const qn = query(
        collection(db, "notifications"),
        where("toUid", "==", uid),
        orderBy("createdAt", "desc"),
        limit(5)
      );
      const sn = await getDocs(qn);
      setNoti(sn.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    })();
  }, [uid]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5 space-y-2">
        <div className="text-lg font-semibold">Find a Teacher</div>
        <p className="text-sm text-neutral-600">
          Browse teachers and request a meeting.
        </p>
        <div className="flex items-center gap-3">
          <Link href="/teachers">
            <Button disabled={!approved} title={approved ? "" : "Wait for admin approval"}>
              Browse Teachers
            </Button>
          </Link>
          {!approved && (
            <span className="text-sm text-amber-700">
              Pending approval — you can browse but cannot book.
            </span>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <div className="text-lg font-semibold">My Appointments</div>
        <Link href="/appointments">
          <Button>Open My Appointments</Button>
        </Link>
        <ul className="space-y-1 text-sm mt-2">
          {recent.length === 0 && (
            <li className="text-neutral-600">No recent appointments.</li>
          )}
          {recent.map(a => (
            <li key={a.id}>
              {new Date(a.startAt.seconds * 1000).toLocaleString()} —{" "}
              <span className="capitalize">{a.status}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5 space-y-2 md:col-span-2">
        <div className="text-lg font-semibold">Notifications</div>
        <ul className="space-y-1 text-sm">
          {noti.length === 0 && (
            <li className="text-neutral-600">No notifications.</li>
          )}
          {noti.map(n => (
            <li key={n.id}>
              {new Date(n.createdAt.seconds * 1000).toLocaleString()} — {n.text}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
