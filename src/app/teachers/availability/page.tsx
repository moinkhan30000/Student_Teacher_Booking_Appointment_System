"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Range = { start: string; end: string };
type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Weekly = Partial<Record<Weekday, Range[]>>;
type Busy = { date: string; start: string; end: string; note?: string };

const DAYS: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export default function TeacherAvailabilityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // admin work window + holidays (read-only here)
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("17:00");

  // teacher data
  const [weekly, setWeekly] = useState<Weekly>({});
  const [busy, setBusy] = useState<Busy[]>([]);
  const [newBusy, setNewBusy] = useState<Busy>({ date: "", start: "09:00", end: "10:00", note: "" });

  // For adding new weekly slot per day
  const [newWeekly, setNewWeekly] = useState<Record<Weekday, Range>>({
    mon: { start: "09:00", end: "10:00" },
    tue: { start: "09:00", end: "10:00" },
    wed: { start: "09:00", end: "10:00" },
    thu: { start: "09:00", end: "10:00" },
    fri: { start: "09:00", end: "10:00" },
    sat: { start: "09:00", end: "10:00" },
    sun: { start: "09:00", end: "10:00" },
  } as any);

  // Load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return router.replace("/");

        const idToken = await user.getIdToken(true); // pick up fresh claims
        const res = await fetch("/api/teacher/availability", {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (res.status === 401 || res.status === 403) {
          toast.error("Only teachers can access this page.");
          return router.replace("/dashboard");
        }
        if (!res.ok) throw new Error(await res.text());

        const data = await res.json();
        if (!alive) return;

        // admin window
        setWorkStart(data?.admin?.workdayStart || "09:00");
        setWorkEnd(data?.admin?.workdayEnd || "17:00");

        // teacher weekly class hours + busy
        setWeekly(data?.weekly || {});
        setBusy(Array.isArray(data?.busy) ? data.busy : []);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to load availability");
        router.replace("/dashboard");
      } finally {
        alive && setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [router]);

  const canSave = useMemo(() => !saving && !loading, [saving, loading]);

  function clipToWorkday(r: Range): Range | null {
    const s = r.start >= workStart ? r.start : workStart;
    const e = r.end <= workEnd ? r.end : workEnd;
    if (e <= s) return null;
    return { start: s, end: e };
  }

  // Weekly class hours (recurring busy)
  function addWeeklySlot(day: Weekday) {
    const candidate = clipToWorkday(newWeekly[day]);
    if (!candidate) return toast.warning(`Invalid time for ${day.toUpperCase()}`);
    setWeekly((prev) => {
      const arr = Array.isArray(prev[day]) ? [...(prev[day] as Range[])] : [];
      arr.push(candidate);
      return { ...prev, [day]: arr };
    });
  }
  function removeWeeklySlot(day: Weekday, idx: number) {
    setWeekly((prev) => {
      const arr = Array.isArray(prev[day]) ? [...(prev[day] as Range[])] : [];
      arr.splice(idx, 1);
      return { ...prev, [day]: arr };
    });
  }

  // Ad-hoc busy block
  function addBusyBlock() {
    const today = new Date().toISOString().slice(0,10);
    if (!newBusy.date || newBusy.date < today) return toast.warning("Pick a future date");
    const clipped = clipToWorkday({ start: newBusy.start, end: newBusy.end });
    if (!clipped) return toast.warning("Invalid busy time window");
    setBusy((b) => [{ date: newBusy.date, ...clipped, note: newBusy.note || "" }, ...b]);
    setNewBusy({ date: "", start: workStart, end: workStart, note: "" });
  }
  function removeBusyBlock(i: number) {
    setBusy((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function saveAll() {
    try {
      setSaving(true);
      const idToken = await getAuth().currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Not signed in");

      const res = await fetch("/api/teacher/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ weekly, busy }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Availability saved");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="container py-8 text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">My Availability</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Work hours: <b>{workStart}</b> – <b>{workEnd}</b>. You can mark your recurring class hours (weekly) and ad-hoc busy blocks.
          Students can only book outside these busy periods.
        </p>
      </div>

      {/* Weekly class hours */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-medium">Weekly class hours (recurring busy)</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {DAYS.map(({ key, label }) => {
            const slots = (weekly[key] || []) as Range[];
            const nw = newWeekly[key] || { start: workStart, end: workEnd };
            return (
              <div key={key} className="rounded-xl border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{label}</div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={nw.start}
                      min={workStart}
                      max={workEnd}
                      onChange={(e) => setNewWeekly((s) => ({ ...s, [key]: { ...nw, start: e.target.value } }))}
                      className="w-28"
                    />
                    <span className="text-neutral-500">—</span>
                    <Input
                      type="time"
                      value={nw.end}
                      min={workStart}
                      max={workEnd}
                      onChange={(e) => setNewWeekly((s) => ({ ...s, [key]: { ...nw, end: e.target.value } }))}
                      className="w-28"
                    />
                    <Button size="sm" variant="secondary" onClick={() => addWeeklySlot(key)}>
                      Add
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {slots.length === 0 ? (
                    <div className="text-sm text-neutral-500">No class hours.</div>
                  ) : (
                    slots.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="text-sm">
                          {r.start} – {r.end}
                        </div>
                        <Button size="sm" variant="destructive" onClick={() => removeWeeklySlot(key, i)}>
                          Delete
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Ad-hoc busy */}
      <Card className="p-4 space-y-4">
        <h2 className="text-lg font-medium">Ad-hoc busy blocks</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Date</div>
            <Input
              type="date"
              value={newBusy.date}
              min={new Date().toISOString().slice(0,10)}
              onChange={(e) => setNewBusy((s) => ({ ...s, date: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Start</div>
            <Input
              type="time"
              value={newBusy.start}
              min={workStart}
              max={workEnd}
              onChange={(e) => setNewBusy((s) => ({ ...s, start: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">End</div>
            <Input
              type="time"
              value={newBusy.end}
              min={workStart}
              max={workEnd}
              onChange={(e) => setNewBusy((s) => ({ ...s, end: e.target.value }))}
            />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Note (optional)</div>
            <Input
              placeholder="Reason"
              value={newBusy.note || ""}
              onChange={(e) => setNewBusy((s) => ({ ...s, note: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={addBusyBlock}>Add busy block</Button>
        </div>

        <div className="divide-y rounded-xl border">
          {busy.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500">No busy blocks yet.</div>
          ) : (
            busy.map((b, i) => (
              <div key={`${b.date}-${b.start}-${b.end}-${i}`} className="p-3 flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium">{b.date}</span> · {b.start} – {b.end}
                  {b.note ? <span className="text-neutral-600"> · {b.note}</span> : null}
                </div>
                <Button variant="destructive" onClick={() => removeBusyBlock(i)}>Delete</Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveAll} disabled={!canSave}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}
