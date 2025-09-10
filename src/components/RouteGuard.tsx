"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/auth";


export default function RouteGuard() {
  const { uid, loading } = useUser();
  const pathname = usePathname();
  const router = useRouter();


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
