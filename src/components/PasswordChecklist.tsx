// src/components/PasswordChecklist.tsx
"use client";

import { checkPassword } from "@/lib/passwordPolicy";

export default function PasswordChecklist({ value }: { value: string }) {
  const c = checkPassword(value);
  const Row = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <div className={`flex items-center gap-2 text-sm ${ok ? "text-emerald-600" : "text-neutral-600"}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-neutral-300"}`} />
      {children}
    </div>
  );

  return (
    <div className="rounded-md border p-3 bg-white">
      <div className="text-xs font-medium text-neutral-700 mb-1">Password must include</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Row ok={c.length}>8–16 characters</Row>
        <Row ok={c.upper}>At least one uppercase letter</Row>
        <Row ok={c.lower}>At least one lowercase letter</Row>
        <Row ok={c.number}>At least one number</Row>
        <Row ok={c.special}>At least one special character</Row>
      </div>
    </div>
  );
}
