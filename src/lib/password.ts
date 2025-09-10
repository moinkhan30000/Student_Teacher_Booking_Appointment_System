// src/lib/password.ts
// Client-side checker to mirror console policy (8–16, UPPER, lower, number, symbol)
export function checkPassword(pw: string) {
  const tests = {
    length: pw.length >= 8 && pw.length <= 16,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  const ok = Object.values(tests).every(Boolean);
  return { ok, tests };
}

export function passwordChecklist(pw: string) {
  const { tests } = checkPassword(pw);
  const Line = (ok: boolean, text: string) =>
    `<li style="display:flex;gap:.5rem;align-items:center;color:${ok ? '#166534' : '#991b1b'}">
       <span style="width:8px;height:8px;border-radius:9999px;background:${ok ? '#16a34a' : '#ef4444'}"></span>${text}
     </li>`;
  return `
    <ul style="margin:.5rem 0 0 0;padding-left:0;list-style:none;font-size:.875rem">
      ${Line(tests.length, "8–16 characters")}
      ${Line(tests.upper, "At least one uppercase letter")}
      ${Line(tests.lower, "At least one lowercase letter")}
      ${Line(tests.number, "At least one number")}
      ${Line(tests.symbol, "At least one symbol")}
    </ul>`;
}
