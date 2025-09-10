// src/lib/passwordPolicy.ts
export type PwCheck = {
  length: boolean;
  upper: boolean;
  lower: boolean;
  number: boolean;
  special: boolean;
};

export function checkPassword(pw: string): PwCheck {
  return {
    length: pw.length >= 8 && pw.length <= 16,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

export function isCompliant(pw: string) {
  const c = checkPassword(pw);
  return c.length && c.upper && c.lower && c.number && c.special;
}
