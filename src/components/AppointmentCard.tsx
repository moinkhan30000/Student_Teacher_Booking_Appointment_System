export function AppointmentCard({ m }: { m: any }) {
  const s = (t:any)=> new Date(t.seconds? t.seconds*1000 : t).toLocaleString();
  return (
    <li className="p-3 rounded-xl bg-white shadow flex justify-between">
      <span>Teacher: {m.teacherId} • {s(m.startAt)} → {s(m.endAt)}</span>
      <span className="font-medium capitalize">{m.status}</span>
    </li>
  );
}
