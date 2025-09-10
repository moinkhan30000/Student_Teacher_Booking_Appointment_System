"use client";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { logEvent } from "@/lib/log";

type U = { id: string; email: string; displayName?: string; approved?: boolean; roles?: string[]; };

export default function AdminUsers() {
  const [items, setItems] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const snap = await getDocs(collection(db, "users"));
    setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    setLoading(false);
  }
  useEffect(()=>{ load(); }, []);

  async function approve(id: string) {
    await updateDoc(doc(db, "users", id), { approved: true });
    await logEvent(null, "user:approve", { id });
    toast.success("User approved");
    await load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      {loading ? <p>Loading…</p> : (
        <>
          <Card className="p-4">
            <div className="font-medium mb-2">Pending Approval</div>
            <ul className="space-y-2">
              {items.filter(u=>!u.approved).map(u=>(
                <li key={u.id} className="flex items-center justify-between p-2 rounded-lg bg-neutral-50">
                  <div className="text-sm">
                    <div className="font-medium">{u.displayName || u.email}</div>
                    <div className="text-neutral-600">{u.email}</div>
                  </div>
                  <Button onClick={()=>approve(u.id)}>Approve</Button>
                </li>
              ))}
              {items.filter(u=>!u.approved).length === 0 && <div className="text-sm text-neutral-600">No pending users.</div>}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="font-medium mb-2">All Users</div>
            <ul className="space-y-1">
              {items.map(u=>(
                <li key={u.id} className="text-sm flex justify-between">
                  <span>{u.displayName || u.email}</span>
                  <span className={`px-2 py-0.5 rounded-full ${u.approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {u.approved ? "Approved" : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
