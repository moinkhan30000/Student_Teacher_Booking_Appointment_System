import { Card } from "@/components/ui/card";
import Link from "next/link";

export function TeacherCard({ id, name, department, subject }:{
  id: string; name: string; department: string; subject: string;
}) {
  return (
    <Card className="p-4 space-y-1">
      <div className="font-semibold">{name}</div>
      <div className="text-sm text-neutral-600">{department} • {subject}</div>
      <Link href={`/appointments?teacher=${id}`} className="inline-block underline mt-2">
        Book appointment
      </Link>
    </Card>
  );
}
