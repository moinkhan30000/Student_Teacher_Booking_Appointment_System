"use client";

import Link from "next/link";
import { useUser } from "@/lib/auth";
import { isAdmin, isTeacher } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export default function Topbar() {
  const { uid, roles, displayName } = useUser();
  const admin = isAdmin(roles);
  const teacher = isTeacher(roles);
  const student = !!uid && !admin && !teacher;

  async function handleSignOut() {
    try {
      await signOut(auth);
      // hard-redirect to sign-in so the view updates immediately
      window.location.href = "/";
    } catch (e) {
      console.error("Sign out failed:", e);
    }
  }

  return (
    <header className="border-b bg-white">
      <div className="container flex h-14 items-center justify-between">
        <Link href={uid ? "/dashboard" : "/"} className="font-semibold">
          Student–Teacher Booking
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          {uid ? (
            <>
              <Link href="/dashboard" className="hover:underline px-2 py-1">
                Dashboard
              </Link>

              {student && (
                <>
                  <Link href="/teachers" className="hover:underline px-2 py-1">
                    Find Teachers
                  </Link>
                  <Link href="/appointments" className="hover:underline px-2 py-1">
                    My Appointments
                  </Link>
                </>
              )}

              {teacher && (
                <>
                  <Link href="/appointments/manage" className="hover:underline px-2 py-1">
                    Manage Requests
                  </Link>
                  <Link href="/teachers/availability" className="hover:underline px-2 py-1">
                    My Availability
                  </Link>
                </>
              )}

              {admin && (
                <>
                  <Link href="/admin/users" className="hover:underline px-2 py-1">
                    Users
                  </Link>
                  <Link href="/admin/teachers" className="hover:underline px-2 py-1">
                    Teachers
                  </Link>
                </>
              )}

              <Link href="/profile" className="hover:underline px-2 py-1">
                Profile
              </Link>

              <span className="px-2 text-neutral-600 hidden md:inline">
                {displayName || ""}
              </span>
              <Button size="sm" variant="secondary" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Link href="/" className="hover:underline px-2 py-1">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
