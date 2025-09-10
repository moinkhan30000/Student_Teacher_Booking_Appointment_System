
export type HHMM = `${number}${number}:${number}${number}`; // "09:00"
export type DayKey = "sun"|"mon"|"tue"|"wed"|"thu"|"fri"|"sat";

export function yyyy_mm_dd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

export function toDateAtLocal(dateStr: string, hhmm: HHMM) {
  const [h,m] = hhmm.split(":").map(Number);
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d;
}

// minutes since 00:00
export function minutes(hhmm: HHMM) {
  const [h, m] = hhmm.split(":").map(Number);
  return h*60 + m;
}
export function fromMinutes(mins: number): HHMM {
  const h = Math.floor(mins/60);
  const m = mins % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}` as HHMM;
}

export function isWeekday(d: Date) {
  const wd = d.getDay(); // 0 Sun ... 6 Sat
  return wd >= 1 && wd <= 5;
}

export function dayKey(d: Date): DayKey {
  return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()] as DayKey;
}

export type Slot = { start: HHMM; end: HHMM };

export function generateSlots(start: HHMM, end: HHMM, stepMin = 30): Slot[] {
  const s = minutes(start);
  const e = minutes(end);
  const out: Slot[] = [];
  for (let t = s; t + stepMin <= e; t += stepMin) {
    out.push({ start: fromMinutes(t), end: fromMinutes(t + stepMin) });
  }
  return out;
}

export function overlap(a: Slot, b: Slot) {
  // compare in minutes
  const aS = minutes(a.start), aE = minutes(a.end);
  const bS = minutes(b.start), bE = minutes(b.end);
  return Math.max(aS, bS) < Math.min(aE, bE);
}

export function slotsMinusBusy(slots: Slot[], busy: Slot[]) {
  return slots.filter(s => !busy.some(b => overlap(s,b)));
}
