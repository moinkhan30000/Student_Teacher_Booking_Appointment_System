"use client";

import { ReactNode, useEffect } from "react";
import { useUser } from "./auth";
import { useRouter } from "next/navigation";
import { anyRole } from "./roles";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { uid, loading } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !uid) router.replace("/");
  }, [loading, uid, router]);
  if (loading || !uid) return null; 
  return <>{children}</>;
}

export function RequireRoles({ roles, children }: { roles: ("admin"|"teacher"|"student")[], children: ReactNode }) {
  const { roles: userRoles, loading, uid } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (!loading && (!uid || !anyRole(userRoles, roles))) router.replace("/dashboard");
  }, [loading, uid, userRoles, roles, router]);
  if (loading || !uid || !anyRole(userRoles, roles)) return null;
  return <>{children}</>;
}
