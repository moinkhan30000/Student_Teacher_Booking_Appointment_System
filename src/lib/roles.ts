
export type Role = "admin" | "teacher" | "student";

export const ROLES = {
  admin: "admin",
  teacher: "teacher",
  student: "student",
} as const;


export function hasRole(
  roles: readonly string[] | null | undefined,
  role: Role
): boolean {
  return Array.isArray(roles) && roles.includes(role);
}


export function anyRole(
  roles: readonly string[] | null | undefined,
  required: readonly Role[]
): boolean {
  if (!Array.isArray(roles)) return false;
  return required.some((r) => roles.includes(r));
}


export function allRoles(
  roles: readonly string[] | null | undefined,
  required: readonly Role[]
): boolean {
  if (!Array.isArray(roles)) return false;
  return required.every((r) => roles.includes(r));
}


export const isAdmin   = (roles?: readonly string[] | null) => hasRole(roles, "admin");
export const isTeacher = (roles?: readonly string[] | null) => hasRole(roles, "teacher");
export const isStudent = (roles?: readonly string[] | null) =>

  hasRole(roles, "student") || (!isAdmin(roles) && !isTeacher(roles));


export const canManageTeachers = (roles?: readonly string[] | null) => isAdmin(roles);
export const canModerateAppointments = (roles?: readonly string[] | null) =>
  isAdmin(roles) || isTeacher(roles);
