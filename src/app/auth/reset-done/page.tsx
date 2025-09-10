"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// If you want to be extra-safe about build/prerendering:
// export const dynamic = "force-dynamic";

function ClearAndRoute() {
  const search = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Clear the 24h lock ONLY after a real reset redirect lands here.
    try {
      const emailParam =
        search.get("email") ||
        search.get("oobEmail") || // some providers pass this
        localStorage.getItem("lastResetEmail") ||
        "";

      if (emailParam) {
        const email = emailParam.toLowerCase().trim();
        localStorage.removeItem(`signin.failures:${email}`);
        localStorage.removeItem(`signin.cooldownUntil:${email}`);
      }
    } catch {
      // no-op if storage blocked
    }

    // Optional: support ?next=/somewhere
    const next = search.get("next") || "/";
    const t = setTimeout(() => router.replace(next), 50);
    return () => clearTimeout(t);
  }, [search, router]);

  return (
    <div className="container py-10">
      <Card className="max-w-md mx-auto p-6">
        <h1 className="text-xl font-semibold">Password updated</h1>
        <p className="text-sm text-neutral-600 mt-1">
          You can now sign in with your new password.
        </p>
        <Button className="mt-4" onClick={() => router.replace("/")}>
          Go to sign in
        </Button>
      </Card>
    </div>
  );
}

export default function ResetDonePage() {
  return (
    <Suspense fallback={<div className="container py-10">Loading…</div>}>
      <ClearAndRoute />
    </Suspense>
  );
}
