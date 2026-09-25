"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { browserDb } from "./supabase-browser";
import { DEMO_ORG } from "./tenant";

export type Identity = { email: string; role: "owner" | "sales_adviser" | null };
export function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const db = browserDb();
    if (!db) { setLoading(false); return; }
    const { data: session } = await db.auth.getSession();
    if (!session.session) { setIdentity(null); setLoading(false); return; }
    const { data: user, error } = await db.auth.getUser();
    if (error || !user.user) { setIdentity(null); setLoading(false); return; }
    const { data: member } = await db.from("organization_members").select("role").eq("organization_id", DEMO_ORG).eq("user_id", user.user.id).eq("active", true).maybeSingle();
    setIdentity({ email: user.user.email || "Signed in", role: member?.role === "owner" || member?.role === "sales_adviser" ? member.role : null });
    setLoading(false);
  }, []);
  useEffect(() => { queueMicrotask(() => void refresh()); const db = browserDb(); const listener = db?.auth.onAuthStateChange(() => { setTimeout(() => void refresh(), 0); }); return () => listener?.data.subscription.unsubscribe(); }, [refresh]);
  return { identity, loading, refresh };
}

export async function authorizedFetch(path: string, options?: RequestInit) {
  const db = browserDb();
  if (!db) throw new Error("Supabase environment is not configured.");
  const { data } = await db.auth.getSession();
  if (!data.session) throw new Error("Sign in to continue.");
  return fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers, Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
}

export function AuthPanel({ children }: { children: (identity: Identity) => ReactNode }) {
  const router = useRouter();
  const { identity, loading, refresh } = useIdentity();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  useEffect(() => { let active = true; fetch("/api/auth/demo-login", { cache: "no-store" }).then(r => r.json()).then(data => { if (active) setDemoEnabled(data.enabled === true); }).catch(() => {}); return () => { active = false; }; }, []);
  async function demoLogin(account: "adviser" | "owner") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/demo-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account }) });
      if (!response.ok) throw new Error("Trial sign-in is unavailable. Please try again or sign in manually.");
      // Read the server-issued Supabase cookies and verify the new identity.
      await refresh();
      router.replace("/orders/new");
      setBusy(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Trial sign-in failed."); setBusy(false); }
  }
  if (loading) return <div className="page">Checking session…</div>;
  if (!browserDb()) return <div className="page"><h1>Supabase configuration needed</h1><p>Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then provision adviser and owner users as described in the README.</p></div>;
  if (!identity) return <div className="page auth-page"><div className="panel"><div className="eyebrow">SHAMSY OPERATIONS</div><h1>Sign in</h1><p>{demoEnabled ? "Use one of the trial roles below, or sign in manually." : "Sign in with your Shamsy account."}</p>
    {demoEnabled && <><div className="demo-access"><button className="button primary" disabled={busy} onClick={() => void demoLogin("adviser")}>Continue as Sales Adviser</button><button className="button secondary" disabled={busy} onClick={() => void demoLogin("owner")}>Continue as Owner</button><p className="demo-note">Fictional trial accounts. Authentication and permissions are enforced through Supabase.</p></div><div className="auth-divider"><span>or</span></div></>}
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setMessage(""); const { error } = await browserDb()!.auth.signInWithPassword({ email, password }); if (error) setMessage(error.message); else await refresh(); setBusy(false); }}><label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label><label>Password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label><button className="button primary" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button></form>{message && <p className="error-message" role="status">{message}</p>}<p className="demo-note">Fictional trial data · authenticated through Supabase</p></div></div>;
  if (!identity.role) return <div className="page"><h1>Membership required</h1><p>This account has no active order role in the Shamsy organization.</p><button className="button secondary" onClick={() => void browserDb()?.auth.signOut({ scope: "local" })}>Sign out</button></div>;
  return <>{children(identity)}</>;
}

export function SessionStrip({ identity, onSignOut }: { identity: Identity; onSignOut?: () => void }) {
  return <div className="demo-strip"><div><span>Signed in as </span><strong>{identity.role === "owner" ? "Owner" : "Sales Adviser"}</strong></div><button className="button secondary" onClick={() => { onSignOut?.(); void browserDb()?.auth.signOut({ scope: "local" }); }}>Sign out</button></div>;
}
