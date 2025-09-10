"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";

import { RequireAuth } from "@/lib/guards";
import { useUser } from "@/lib/auth";
import { isAdmin, isTeacher } from "@/lib/roles";

type Teacher = { id: string; name: string; department: string; subject: string };

export default function TeachersPage() {
  return (
    <RequireAuth>
      <StudentsOnly />
    </RequireAuth>
  );
}

function StudentsOnly() {
  const { roles } = useUser();
  // Hide page for teacher/admin (they don't need to browse teachers)
  if (isTeacher(roles) || isAdmin(roles)) return null;

  const [q, setQ] = useState("");
  const [items, setItems] = useState<Teacher[]>([]);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "teachers"));
      setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    })();
  }, []);

  const filtered = items.filter(t =>
    `${t.name} ${t.department} ${t.subject}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by name, subject, department"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <Card key={t.id} className="p-4 space-y-1">
            <div className="font-semibold">{t.name}</div>
            <div className="text-sm text-neutral-600">
              {t.department} • {t.subject}
            </div>
            <Link
              href={`/appointments?teacher=${t.id}`}
              className="inline-block underline mt-2"
            >
              Book appointment
            </Link>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="p-4 text-sm text-neutral-600">
            No teachers match your search.
          </Card>
        )}
      </div>
    </div>
  );
}
