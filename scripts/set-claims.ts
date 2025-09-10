/**
 * One-off script to add/remove custom-claim roles to a user.
 *
 * Usage (Windows PowerShell/cmd):
 *   # Add admin
 *   npx tsx scripts\set-claims.ts admin@example.com admin
 *
 *   # Add teacher
 *   npx tsx scripts\set-claims.ts prof@example.com teacher
 *
 *   # Add multiple roles
 *   npx tsx scripts\set-claims.ts user@example.com admin,teacher
 *
 *   # Remove a role
 *   npx tsx scripts\set-claims.ts user@example.com --remove teacher
 *
 * Requires .env.local with:
 *   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account", ...}
 */
// Load environment variables from .env.local for Node scripts
import { config as loadEnv } from "dotenv";
import path from "path";
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

type Args = {
  email: string;
  addRoles: string[];
  removeRole?: string;
};

function parseArgs(): Args {
  const [, , emailArg, rolesArgOrFlag, maybeRole] = process.argv;

  if (!emailArg) {
    console.error("Usage: tsx scripts/set-claims.ts EMAIL role1[,role2]");
    console.error("   or: tsx scripts/set-claims.ts EMAIL --remove role");
    process.exit(1);
  }

  if (rolesArgOrFlag === "--remove") {
    if (!maybeRole) {
      console.error("Provide a role to remove. Example: --remove teacher");
      process.exit(1);
    }
    return { email: emailArg, addRoles: [], removeRole: maybeRole };
  }

  const addRoles = (rolesArgOrFlag || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (addRoles.length === 0) {
    console.error("Provide at least one role to add, e.g. admin or teacher");
    process.exit(1);
  }

  return { email: emailArg, addRoles };
}

function requireServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is missing from .env.local");
    process.exit(1);
  }
  try {
    return JSON.parse(json);
  } catch {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs();
  const sa = requireServiceAccount();

  if (getApps().length === 0) {
    initializeApp({ credential: cert(sa) });
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(args.email);
  const current = (user.customClaims || {}) as { roles?: string[] };
  const roles = new Set(current.roles || []);

  if (args.removeRole) {
    roles.delete(args.removeRole);
  } else {
    for (const r of args.addRoles) roles.add(r);
  }

  await auth.setCustomUserClaims(user.uid, { roles: Array.from(roles) });
  await auth.revokeRefreshTokens(user.uid); // force clients to pick up new claims

  console.log("Updated roles for", args.email, "→", Array.from(roles));
  console.log("Tip: user must sign out/in to refresh claims in the app.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
