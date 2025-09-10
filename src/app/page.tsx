"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { auth, db } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  getAuth,
} from "firebase/auth";
import { setDoc, doc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { toast } from "sonner";
import { logEvent } from "@/lib/log";
import { useUser } from "@/lib/auth";
import PasswordChecklist from "@/components/PasswordChecklist";
import { isCompliant } from "@/lib/passwordPolicy";

// ----- login limiter (3 attempts -> 24h cooldown)
const MAX_ATTEMPTS = 3;
const FAIL_KEY = (email: string) => `signin.failures:${email.toLowerCase().trim()}`;
const UNTIL_KEY = (email: string) => `signin.cooldownUntil:${email.toLowerCase().trim()}`;

function getFailures(email: string) {
  return Number(localStorage.getItem(FAIL_KEY(email)) || "0");
}
function recordFailure(email: string) {
  const n = getFailures(email) + 1;
  localStorage.setItem(FAIL_KEY(email), String(n));
  if (n >= MAX_ATTEMPTS) {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem(UNTIL_KEY(email), String(until));
  }
  return n;
}
function recordSuccess(email: string) {
  localStorage.removeItem(FAIL_KEY(email));
  localStorage.removeItem(UNTIL_KEY(email));
}
function getCooldownMs(email: string) {
  const until = Number(localStorage.getItem(UNTIL_KEY(email)) || "0");
  return Math.max(0, until - Date.now());
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);

  const router = useRouter();
  const { uid, loading } = useUser();

  // cooldown + attempts state
  const [cooldown, setCooldown] = useState(0);
  const [attempts, setAttempts] = useState(0);

  // If already signed in, leave this page
  useEffect(() => {
    if (!loading && uid) {
      router.replace("/dashboard");
    }
  }, [loading, uid, router]);

  // Reset password field when mode flips
  useEffect(() => setPw(""), [mode]);

  // Track cooldown + attempts for the current email
  useEffect(() => {
    if (!email) {
      setCooldown(0);
      setAttempts(0);
      return;
    }
    setAttempts(getFailures(email));
    setCooldown(getCooldownMs(email));
    const id = setInterval(() => setCooldown(getCooldownMs(email)), 1000);
    return () => clearInterval(id);
  }, [email]);

  const disabled =
    busy || !email || (mode === "login" && (cooldown > 0 || attempts >= MAX_ATTEMPTS));

  const waitText = useMemo(() => {
    if (cooldown <= 0) return "";
    const secs = Math.ceil(cooldown / 1000);
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${hrs}h ${mins}m ${s}s`;
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;

    setBusy(true);
    try {
      if (mode === "register") {
        if (!name.trim()) return toast.warning("Please enter your name");
        if (!department.trim()) return toast.warning("Please enter your department");
        if (!isCompliant(pw)) return toast.warning("Please meet all password requirements.");

        const cred = await createUserWithEmailAndPassword(auth, email, pw);
        await updateProfile(cred.user, { displayName: name });

        await setDoc(doc(db, "users", cred.user.uid), {
          displayName: name,
          email,
          roles: [],            // student until admin assigns
          approved: false,
          department,
          pwCompliant: true,    // new accounts comply
        });

        await sendEmailVerification(cred.user);
        await logEvent(cred.user.uid, "auth:register");
        toast.success("Account created. Check your email to verify.");
        recordSuccess(email);
        router.replace("/dashboard");
      } else {
        // LOGIN
        if (cooldown > 0 || attempts >= MAX_ATTEMPTS) {
          toast.error("Too many attempts. Reset your password or wait for the cooldown.");
          return;
        }
        const a = getAuth();
        const cred = await signInWithEmailAndPassword(a, email, pw);
        await logEvent(cred.user.uid, "auth:login");
        recordSuccess(email);

        await new Promise((r) => setTimeout(r, 0));
        router.replace("/dashboard");
      }
    } catch (e: any) {
      console.error(e);
      if (mode === "login") {
        const n = recordFailure(email);
        setAttempts(n);
        setCooldown(getCooldownMs(email));

        const left = Math.max(0, MAX_ATTEMPTS - n);
        if (left > 0) {
          toast.error(`Wrong email or password. ${left} attempt${left === 1 ? "" : "s"} left.`);
        } else {
          toast.error("Too many attempts. Please reset your password to continue, or try again later.");
        }
      } else {
        toast.error((e?.code || e?.message || "Authentication failed").replace("auth/", ""));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className="grid place-items-center min-h-[70vh]">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold">
            {mode === "login" ? "Sign in" : "Create account"}
          </h1>
          <button
            className="text-sm underline"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Create account" : "Have an account? Sign in"}
          </button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <Input
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                placeholder="Department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
              />
            </>
          )}

          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            type="password"
            placeholder={mode === "login" ? "Password" : "New password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {/* Show policy only on registration */}
          {mode === "register" && <PasswordChecklist value={pw} />}

          {mode === "login" && (cooldown > 0 || attempts > 0) && (
            <div className="text-sm mt-1">
              {cooldown > 0 ? (
                <span className="text-red-600">
                  Too many attempts. Reset your password or wait {waitText}.
                </span>
              ) : (
                <span className="text-neutral-600">
                  Attempts remaining: <b>{Math.max(0, MAX_ATTEMPTS - attempts)} / {MAX_ATTEMPTS}</b>
                </span>
              )}
            </div>
          )}

          <Button className="w-full" type="submit" disabled={disabled}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
          </Button>
        </form>

        {mode === "login" && (
          <div className="text-sm">
            <Link className="underline" href="/auth/forgot-password">
              Forgot password?
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
