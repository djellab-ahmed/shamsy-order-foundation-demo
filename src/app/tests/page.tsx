import Link from "next/link";
const checks = [
  ["Fixed USD prices, integer cents, 1.94% / 4.32% / 7.25%", "UI + PostgreSQL", "tests/finance.test.ts · tests/sql/rls.sql"],
  ["Adviser direct >5% save fails and persists nothing", "PostgreSQL RPC", "tests/sql/rls.sql · scripts/prove-server-enforcement.mjs"],
  ["Direct table writes and forged owner roles cannot bypass approval", "PostgreSQL grants + HTTP", "tests/sql/rls.sql · tests/e2e/demo-access.spec.ts"],
  ["Only owner approves exact product, price, quantity, discount", "PostgreSQL RPC + RLS", "tests/sql/rls.sql"],
  ["Changing a discount, quantity, product, or catalogue price invalidates approval", "PostgreSQL RPC + trigger", "tests/sql/rls.sql"],
  ["Rate below 8,000 rejected", "UI + PostgreSQL", "tests/finance.test.ts · tests/sql/rls.sql"],
  ["Saved rate and line prices remain historical facts", "PostgreSQL + immutable triggers", "tests/sql/rls.sql"],
  ["Authenticated 390px order flow and overflow", "Playwright", "tests/e2e/order.spec.ts"],
  ["Tenant reads and direct writes obey RLS and database grants", "PostgreSQL policies + grants", "tests/sql/rls.sql"],
] as const;
export default function Verification() { return <div className="page prose-page"><div className="eyebrow">VERIFICATION</div><h1>How the rules are checked</h1><p className="lead">These are acceptance criteria and their executable test locations. Test results come from the repository or CI; this page does not run them in the browser.</p><div className="panel verification-list">{checks.map(([rule, layer, file]) => <div key={rule}><strong>{rule}</strong><span>{layer}</span><code>{file}</code></div>)}</div><p>Run <code>npm run verify:all</code> for lint, type checking, unit, database, browser, build, and secret exposure checks. With provisioned Supabase accounts and the app running, run <code>npm run prove</code> for the direct adviser API attack and database readback.</p><p className="demo-note">The authenticated Playwright flow and HTTP proof require the Supabase credentials described in README.md. Without them, Playwright runs only its unauthenticated checks and reports the authenticated case as skipped.</p><Link href="/orders/new" className="button primary">Open order entry</Link></div>; }
