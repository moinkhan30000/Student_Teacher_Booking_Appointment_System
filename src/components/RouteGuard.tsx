"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/auth";

/**
 * Global route guard:
 * - If user is NOT signed in and tries to view a protected page,
 *   redirect to "/" (sign-in).
 * - Public routes: "/", "/auth/forgot-password"
 */
export default function RouteGuard() {
  const { uid, loading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  // Public pages (no auth required)
  const publicPaths = ["/", "/auth/forgot-password"];

  const isPublic = publicPaths.some((p) =>
    pathname === p || pathname.startsWith(`${p}/`)
  );

  useEffect(() => {
    if (loading) return;
    // If not logged in and not on a public page → go to sign-in
    if (!uid && !isPublic) {
      router.replace("/");
    }
  }, [uid, loading, isPublic, router]);

  return null;
}
