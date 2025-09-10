"use client";

import { useEffect, useMemo, useState } from "react";
import { RequireRoles } from "@/lib/guards";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getAuth } from "firebase/auth";
import { ConfirmDialog } from "@/components/confirm-dialog";

type DayKey = "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun";
type DayRule = { start: string; end: string } | null;
type Busy = { id: string; date: string; start: string; end: string; reason?: string };

export default function TeacherSettingsPage() {
  return (
    <RequireRoles roles={["teacher","admin"]}>
      <Inner />
    </RequireRoles>
  );
}

function Inner() {
  const [rules, setRules] = useState<Record<DayKey, DayRule>>({
    mon:{start:"09:00", end:"17:00"},
    tue:{start:"09:00", end:"17:00"},
    wed:{start:"09:00", end:"17:00"},
    thu:{start:"09:00", end:"17:00"},
    fri:{start:"09:00", end:"17:00"},
    sat:null, sun:null
  });
  const [busyList, setBusyList] = useState<Busy[]>([]);
  const [bDate, setBDate] = useState("");
  const [bStart, setBStart] = useState("09:00");
  const [bEnd, setBEnd] = useState("10:00");
  const [bReason, setBReason] = useState("");

  const [saving, setSaving] = useState(false);

  // delete confirm
  const [delOpen, setDelOpen] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);

  const todayStr = useMemo(() => {
    const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }, []);

  useEffect(() => {
    (async () => {
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/teacher/availability", { headers: { Authorization: `Bearer ${idToken}` }});
      const data = await res.json();
      setRules(data);
      const rb = await fetch("/api/teacher/busy", { headers: { Authorization: `Bearer ${idToken}` }});
      const bl = await rb.json();
      setBusyList(bl.items || []);
    })();
  }, []);

  const days: DayKey[] = ["mon","tue","wed","thu","fri","sat","sun"];
  function label(d: DayKey) { return {mon:"Mon",tue:"Tue",wed:"Wed",thu:"Thu",fri:"Fri",sat:"Sat",sun:"Sun"}[d]; }

  function toggle(d: DayKey) {
    setRules(prev => ({...prev, [d]: prev[d] ? null : {start:"09:00", end:"17:00"}}));
  }
  function setTime(d: DayKey, key: "start"|"end", val: string) {
    setRules(prev => ({...prev, [d]: prev[d] ? {...(prev[d] as any), [key]: val} : prev[d]}));
  }

  async function save() {
    setSaving(true);
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/teacher/availability", {
        method: "POST",
        headers: { "Content-Type":"application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(rules)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Saved. ${data.cancelled} future appointments cancelled due to availability change.`);
    } catch (e:any) {
      toast.error(e.message || "Failed");
    } finally { setSaving(false); }
  }

  async function addBusy() {
    if (!bDate || bDate < todayStr) return toast.warning("Pick a future date");
    const idToken = await getAuth().currentUser?.getIdToken();
    const res = await fetch("/api/teacher/busy", {
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${idToken}` },
      body: JSON.stringify({ date:bDate, start:bStart, end:bEnd, reason:bReason })
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || "Failed");
    setBReason("");
    const rb = await fetch("/api/teacher/busy", { headers: { Authorization: `Bearer ${idToken}` }});
    const bl = await rb.json();
    setBusyList(bl.items || []);
    toast.success("Busy block added");
  }

  function askDeleteBusy(id: string) {
    setDelId(id);
    setDelOpen(true);
  }

  async function confirmDeleteBusy() {
    if (!delId) return;
    const idToken = await getAuth().currentUser?.getIdToken();
    const res = await fetch(`/api/teacher/busy?id=${encodeURIComponent(delId)}`, {
      method:"DELETE",
      headers:{ Authorization:`Bearer ${idToken}` }
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || "Failed");
    setBusyList(prev => prev.filter(b => b.id !== delId));
    setDelId(null);
    setDelOpen(false);
    toast.success("Busy block removed");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My Weekly Availability</h1>

      <Card className="p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          {days.map(d => (
            <div key={d} className="flex items-center gap-3">
              <label className="w-14">{label(d)}</label>
              <button onClick={()=>toggle(d)} className="rounded-xl border px-2 py-1 text-sm">
                {rules[d] ? "Enabled" : "Disabled"}
              </button>
              {rules[d] && (
                <>
                  <Input type="time" value={(rules[d] as any).start} onChange={e=>setTime(d,"start", e.target.value)} className="max-w-[140px]" />
                  <span>to</span>
                  <Input type="time" value={(rules[d] as any).end} onChange={e=>setTime(d,"end", e.target.value)} className="max-w-[140px]" />
                </>
              )}
            </div>
          ))}
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save & Apply"}</Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="text-lg font-semibold">Mark Busy (future only)</div>
        <div className="grid md:grid-cols-4 gap-3">
          <Input type="date" min={todayStr} value={bDate} onChange={e=>setBDate(e.target.value)} />
          <Input type="time" value={bStart} onChange={e=>setBStart(e.target.value)} />
          <Input type="time" value={bEnd} onChange={e=>setBEnd(e.target.value)} />
          <Input placeholder="Reason (optional)" value={bReason} onChange={e=>setBReason(e.target.value)} />
        </div>
        <Button onClick={addBusy}>Add busy block</Button>

        <div className="rounded-xl border mt-3">
          {busyList.length === 0 ? (
            <div className="text-sm text-neutral-600 p-3">No busy blocks.</div>
          ) : (
            <ul className="divide-y">
              {busyList.sort((a,b)=>a.date.localeCompare(b.date) || a.start.localeCompare(b.start)).map(b => (
                <li key={b.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <div className="font-medium">{b.date} • {b.start}–{b.end}</div>
                    {b.reason && <div className="text-sm text-neutral-600">{b.reason}</div>}
                  </div>
                  <Button size="sm" variant="destructive" onClick={()=>askDeleteBusy(b.id)}>Delete</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={delOpen}
        title="Delete busy block?"
        description="This will free the selected time window for students to book."
        confirmLabel="Delete"
        onConfirm={confirmDeleteBusy}
        onCancel={() => { setDelOpen(false); setDelId(null); }}
      />
    </div>
  );
}
