"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import {
  collection, getDocs, onSnapshot, orderBy, query, where, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/Confirm";

type Teacher = { id: string; name: string; email?: string; department?: string; subject?: string; active?: boolean; };
type Busy = { date: string; start: string; end: string; source: string; note?: string };
type Workday = { start: string; end: string };

const SLOT_MINUTES = 30;

function isWeekend(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  const dow = d.getDay(); // 0=Sun 6=Sat
  return dow === 0 || dow === 6;
}
function timeToMinutes(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function minutesToTime(m: number) { const h = Math.floor(m / 60); const mm = m % 60; return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; }
function overlaps(aS: string, aE: string, bS: string, bE: string) { return !(aE <= bS || bE <= aS); }
function tomorrowISO() { const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }

function generateSlots(workday: Workday) {
  const out: { start: string; end: string }[] = [];
  const ws = timeToMinutes(workday.start);
  const we = timeToMinutes(workday.end);
  for (let t = ws; t + SLOT_MINUTES <= we; t += SLOT_MINUTES) {
    out.push({ start: minutesToTime(t), end: minutesToTime(t + SLOT_MINUTES) });
  }
  return out;
}

export default function AppointmentsPage() {
  const router = useRouter();
  const { uid, roles, approved, loading } = useUser();

  const isAdmin = roles?.includes("admin");
  const isTeacher = roles?.includes("teacher");
  const isStudent = !!uid && !isAdmin && !isTeacher;

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);

  const [teacherId, setTeacherId] = useState("");
  const [dateISO, setDateISO] = useState(tomorrowISO); // default tomorrow
  const [note, setNote] = useState("");

  const [workday, setWorkday] = useState<Workday | null>(null);
  const [busy, setBusy] = useState<Busy[]>([]);
  const [fetchingAvail, setFetchingAvail] = useState(false);

  const [myDayBlocks, setMyDayBlocks] = useState<Busy[]>([]);

  // pretty confirm state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{start:string;end:string} | null>(null);

  // Guard
  useEffect(() => { if (!loading && !uid) router.replace("/"); }, [uid, loading, router]);

  // Load teachers
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingTeachers(true);
        const snap = await getDocs(query(collection(db, "teachers"), where("active","==",true)));
        if (!alive) return;
        const list: Teacher[] = [];
        snap.forEach((d) => {
          const t = d.data() as any;
          list.push({ id: d.id, name: t?.name || "Unnamed", email: t?.email, department: t?.department, subject: t?.subject, active: t?.active });
        });
        list.sort((a,b)=>a.name.localeCompare(b.name));
        setTeachers(list);
        if (!teacherId && list.length) setTeacherId(list[0].id);
      } catch (e) {
        console.error(e); toast.error("Failed to load teachers");
      } finally { setLoadingTeachers(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Availability (approved busy + teacher blocks + holidays)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teacherId || !dateISO) return;
      if (isWeekend(dateISO)) { setWorkday(null); setBusy([]); return; }
      try {
        setFetchingAvail(true);
        const res = await fetch("/api/teachers/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId, from: dateISO, to: dateISO }),
        });
        if (res.status === 503) {
          toast.info("Availability is preparing. Try again in a moment.");
          setWorkday(null); setBusy([]); return;
        }
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!alive) return;
        setWorkday(data?.workday || null);
        setBusy(Array.isArray(data?.busy) ? data.busy : []);
      } catch (e) {
        console.error(e); toast.error("Failed to load availability");
      } finally { setFetchingAvail(false); }
    })();
    return () => { alive = false; };
  }, [teacherId, dateISO]);

  // Live: my requests for that teacher/day → to show "pending" to me
  useEffect(() => {
    if (!uid || !teacherId || !dateISO) { setMyDayBlocks([]); return; }
    const dayStart = new Date(dateISO + "T00:00:00");
    const dayEnd = new Date(dateISO + "T23:59:59");
    const qy = query(
      collection(db, "appointments"),
      where("studentId","==", uid),
      where("startAt",">=", Timestamp.fromDate(dayStart)),
      where("startAt","<=", Timestamp.fromDate(dayEnd)),
      orderBy("startAt","asc")
    );
    const unsub = onSnapshot(qy, (snap) => {
      const blocks: Busy[] = [];
      snap.forEach((d) => {
        const a = d.data() as any;
        if (a.teacherId !== teacherId) return;
        const s = (a.startAt as Timestamp).toDate();
        const e = (a.endAt as Timestamp).toDate();
        const status = String(a.status || "");
        let source = "";
        if (status === "pending") source = "mine-pending";
        else if (status === "approved") source = "mine-approved";
        else return; // ignore cancelled
        blocks.push({ date: dateISO, start: s.toTimeString().slice(0,5), end: e.toTimeString().slice(0,5), source });
      });
      setMyDayBlocks(blocks);
    }, (err)=>{ console.warn(err); setMyDayBlocks([]); });
    return () => unsub();
  }, [uid, teacherId, dateISO]);

  const slotGrid = useMemo(() => {
    if (!workday || !dateISO || isWeekend(dateISO)) return [];
    const slots = generateSlots(workday);
    return slots.map((s) => {
      const hardHit = busy.find((b) => b.date === dateISO && overlaps(s.start, s.end, b.start, b.end));
      const mine = myDayBlocks.find((b) => b.date === dateISO && overlaps(s.start, s.end, b.start, b.end));
      const isBusy = !!hardHit || (mine?.source === "mine-approved");
      const isPendingMine = !isBusy && mine?.source === "mine-pending";
      return { ...s, isBusy, isPendingMine };
    });
  }, [workday, dateISO, busy, myDayBlocks]);

  function askBook(slotStart: string, slotEnd: string) {
    setPendingAction({ start: slotStart, end: slotEnd });
    setConfirmOpen(true);
  }

  async function bookPending() {
    if (!pendingAction) return;
    const { start, end } = pendingAction;
    try {
      const user = getAuth().currentUser;
      if (!user) return router.replace("/");
      if (!approved) { toast.error("Your account is pending approval."); return; }

      const idToken = await user.getIdToken(true);
      const res = await fetch("/api/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ teacherId, date: dateISO, start, end, note: note || "" }),
      });

      if (res.status === 409) {
        const msg = (await res.json())?.error || "Slot not available";
        toast.error(msg); return;
      }
      if (!res.ok) throw new Error((await res.json())?.error || "Failed");
      toast.success("Request sent!");
      setNote("");
      setPendingAction(null);
    } catch (e: any) {
      console.error(e); toast.error(e?.message || "Failed to book");
    }
  }

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Book an appointment</h1>
        <p className="text-sm text-neutral-600 mt-1">Weekdays only. Same-day bookings are disabled. Pending requests are shown only to you.</p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Teacher</div>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              disabled={loadingTeachers}
            >
              {loadingTeachers ? (
                <option>Loading…</option>
              ) : teachers.length ? (
                teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.subject ? `· ${t.subject}` : ""} {t.department ? `· ${t.department}` : ""}
                  </option>
                ))
              ) : (
                <option>No teachers available</option>
              )}
            </select>
          </div>

          <div>
            <div className="text-xs text-neutral-500 mb-1">Date</div>
            <Input
              type="date"
              value={dateISO}
              min={tomorrowISO()}
              onChange={(e) => setDateISO(e.target.value)}
            />
            {isWeekend(dateISO) && <div className="text-xs text-red-600 mt-1">Weekends are not bookable.</div>}
          </div>

          <div>
            <div className="text-xs text-neutral-500 mb-1">Note (optional)</div>
            <Input placeholder="Add a short note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm text-neutral-600 mb-2">
            {fetchingAvail ? "Loading availability…" : workday ? <>Work hours: <b>{workday.start}</b> – <b>{workday.end}</b></> : "Pick a weekday to see availability"}
          </div>

          {!isWeekend(dateISO) && workday && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {slotGrid.length === 0 ? (
                <div className="col-span-full text-sm text-neutral-500">No free slots on this day.</div>
              ) : (
                slotGrid.map((s) => (
                  <Button
                    key={s.start}
                    variant={s.isBusy ? "outline" : s.isPendingMine ? "outline" : "secondary"}
                    disabled={s.isBusy || s.isPendingMine}
                    title={s.isBusy ? "Busy" : s.isPendingMine ? "Pending (your request)" : "Book this slot"}
                    onClick={() => !s.isBusy && !s.isPendingMine && askBook(s.start, s.end)}
                  >
                    {s.start} – {s.end}{s.isBusy ? " • busy" : s.isPendingMine ? " • pending" : ""}
                  </Button>
                ))
              )}
            </div>
          )}
        </div>
      </Card>

      {/* My requests/upcoming (live) with cancel */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">My requests & upcoming</h2>
        <MyAppointments uid={uid!} />
      </Card>

      {/* Pretty confirm */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Send appointment request?"
        description={
          pendingAction ? (
            <span>
              You’re requesting <b>{pendingAction.start}</b>–<b>{pendingAction.end}</b> on <b>{dateISO}</b>.
            </span>
          ) : null
        }
        confirmText="Send request"
        onConfirm={bookPending}
      />
    </div>
  );
}

function MyAppointments({ uid }: { uid: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const qy = query(
      collection(db, "appointments"),
      where("studentId", "==", uid),
      where("startAt", ">=", Timestamp.fromDate(now)),
      orderBy("startAt", "asc")
    );
    const unsub = onSnapshot(qy, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setItems(arr);
    });
    return () => unsub();
  }, [uid]);

  function askCancel(id: string) {
    setPendingId(id);
    setConfirmOpen(true);
  }

  async function cancel() {
    if (!pendingId) return;
    const id = pendingId;
    setPendingId(null);
    try {
      const idToken = await getAuth().currentUser!.getIdToken(true);
      const res = await fetch("/api/appointments/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: "cancel", id })
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Failed");
    } catch (e: any) {
      // toast shown in page
    }
  }

  if (!items.length) return <div className="text-sm text-neutral-500">No upcoming/pending items.</div>;

  return (
    <div className="space-y-2">
      {items.map((it) => {
        const s = (it.startAt as Timestamp).toDate();
        const e = (it.endAt as Timestamp).toDate();
        const line = `${s.toLocaleDateString()} • ${String(s).slice(16,21)}–${String(e).slice(16,21)} • ${it.status}`;
        return (
          <div key={it.id} className="flex items-center justify-between rounded-md border p-2">
            <div className="text-sm">{line}</div>
            {(it.status === "pending" || it.status === "approved") && (
              <Button size="sm" variant="destructive" onClick={() => askCancel(it.id)}>
                Cancel
              </Button>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Cancel appointment?"
        description="This will free the time for others."
        confirmText="Cancel appointment"
        tone="destructive"
        onConfirm={cancel}
      />
    </div>
  );
}
