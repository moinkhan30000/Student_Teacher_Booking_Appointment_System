"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  onIdTokenChanged,
  getIdTokenResult,
  signOut as fbSignOut,
  User,
  getAuth,
} from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { usePathname, useRouter } from "next/navigation";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const LS_LAST_ACTIVITY = "lastActivity";
const SS_IDLE_LOGOUT = "idleLogout"; 

type AuthState = {
  uid: string | null;
  email: string | null;
  displayName: string | null;
  roles?: string[];
  approved: boolean;
  pwCompliant?: boolean; // NEW
  loading: boolean;
};

const AuthCtx = createContext<AuthState>({
  uid: null,
  email: null,
  displayName: null,
  roles: [],
  approved: false,
  pwCompliant: true,
  loading: true,
});


function mergeRoles(a?: unknown, b?: unknown): string[] {
  const A = Array.isArray(a) ? (a as string[]) : [];
  const B = Array.isArray(b) ? (b as string[]) : [];
  return Array.from(new Set([...A, ...B].filter(Boolean)));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    uid: null,
    email: null,
    displayName: null,
    roles: [],
    approved: false,
    pwCompliant: true,
    loading: true,
  });

  const router = useRouter();
  const pathname = usePathname();

  // Idle tracking: start/reset a timer on user activity; sign out when it fires.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function resetTimer() {
      if (timer) clearTimeout(timer);
      localStorage.setItem(LS_LAST_ACTIVITY, Date.now().toString());
      timer = setTimeout(async () => {
        // Mark that this sign-out was due to an *in-page* idle event
        sessionStorage.setItem(SS_IDLE_LOGOUT, "1");
        await fbSignOut(getAuth());
      }, IDLE_TIMEOUT_MS);
    }

    // Attach activity listeners
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("click", resetTimer);
    window.addEventListener("scroll", resetTimer);
    window.addEventListener("visibilitychange", () => {
      if (!document.hidden) resetTimer();
    });

    // Kick it off immediately
    resetTimer();

    return () => {
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("click", resetTimer);
      window.removeEventListener("scroll", resetTimer);
      if (timer) clearTimeout(timer);
    };
  }, []);


  useEffect(() => {
    const last = parseInt(localStorage.getItem(LS_LAST_ACTIVITY) || "0", 10);
    if (last && Date.now() - last > IDLE_TIMEOUT_MS) {
      
      fbSignOut(getAuth()).catch(() => {});
    }
  }, []);

  // Core auth state 
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      const wasIdleLogout = sessionStorage.getItem(SS_IDLE_LOGOUT) === "1";

      if (!user) {
        setState({
          uid: null,
          email: null,
          displayName: null,
          roles: [],
          approved: false,
          pwCompliant: true,
          loading: false,
        });

        // Show toast ONLY for in-page idle timeouts
        if (wasIdleLogout) {
          toast.info("Signed out due to inactivity.");
          sessionStorage.removeItem(SS_IDLE_LOGOUT);
        }
        return;
      }

      try {
        // Read user profile 
        let approved = false;
        let docRoles: string[] = [];
        let pwCompliant = true;
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const d = snap.data() as any;
            approved = !!d?.approved;
            if (Array.isArray(d?.roles)) docRoles = d.roles as string[];
            // default to true if missing
            pwCompliant = d?.pwCompliant !== false;
          }
        } catch (e) {
          console.warn("Failed to read users profile:", e);
        }

        // Force-refresh the ID token once here to pick up fresh custom claims
        const tokenResult = await getIdTokenResult(user, true);
        const claimRoles = (tokenResult.claims?.roles as unknown) ?? [];

        const roles = mergeRoles(claimRoles, docRoles);

        setState({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          roles,
          approved,
          pwCompliant,
          loading: false,
        });
      } catch (e) {
        console.warn("onAuthStateChanged processing failed:", e);
        // fall back to minimal info if something went wrong
        setState({
          uid: user!.uid,
          email: user!.email,
          displayName: user!.displayName,
          roles: state.roles ?? [],
          approved: state.approved ?? false,
          pwCompliant: state.pwCompliant ?? true,
          loading: false,
        });
      }
    });

    return () => unsub();
    
  }, []);

  
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user: User | null) => {
      if (!user) {
        setState((s) => ({ ...s, roles: [], loading: false }));
        return;
      }
      try {
        
        const tokenResult = await getIdTokenResult(user, true);
        const claimRoles = (tokenResult.claims.roles as string[]) || [];

        
        let docRoles: string[] = [];
        let pwCompliant = true;
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const d = snap.data() as any;
            if (Array.isArray(d?.roles)) docRoles = d.roles as string[];
            pwCompliant = d?.pwCompliant !== false;
          }
        } catch {
          /* ignore */
        }

        const roles = mergeRoles(claimRoles, docRoles);
        setState((s) => ({ ...s, roles, pwCompliant, loading: false }));
      } catch (e) {
        console.warn("Failed to refresh token:", e);
      }
    });

    return () => unsub();
  }, []);

 
  useEffect(() => {
    if (state.loading) return;
    if (!state.uid) return;
    if (state.pwCompliant === false && pathname !== "/force-password") {
      router.replace("/force-password");
    }
  }, [state.loading, state.uid, state.pwCompliant, pathname, router]);

  const value = useMemo(() => state, [state]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useUser() {
  return useContext(AuthCtx);
}
