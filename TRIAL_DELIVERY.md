# Trial delivery for Tayeb and technical lead

The order screen now saves through an authenticated Next.js route into PostgreSQL. The >5% rule is enforced in `public.create_shamsy_order` in `supabase/migrations/202609220001_order_foundation.sql`; direct inserts into final financial tables have no adviser grant. `approve_order_discount` accepts only an authenticated owner and stores the exact draft/line/product/quantity/database-price/discount tuple. A changed restricted line does not match that record. A catalogue price edit also revokes pending approvals through `202609240001_invalidate_price_approvals.sql`. The save function locks price and approval rows through `202609240002_lock_financial_inputs.sql`.

`npm run prove` is the copy/paste direct bypass test after `.env.local` is loaded. It expects `403 OWNER_APPROVAL_REQUIRED`, verifies no row was stored, obtains an owner approval, proves a changed discount fails, then saves and reopens the exact 8,200 order. See README for account provisioning and the command.

Order amounts are integer USD cents and whole SDG. The integer SDG-per-USD rate and authoritative unit prices are persisted as immutable snapshots. The database test changes the current setting to 9,000 and asserts the saved order remains 8,200 / $5,490 / 45,018,000 SDG.

The sign-in page now offers **Continue as Sales Adviser** and **Continue as Owner** using two server-side provisioned fictional Supabase accounts. The client needs only the public URL. A server-only route maps a fixed account selector to private environment credentials, performs normal Supabase password authentication, checks actual database membership, and sets normal session cookies. Passwords never enter the browser. The role indicator, refresh, and sign-out use the authenticated session; switching accounts authenticates a different Auth user. Existing API authorization and RLS are unchanged. The buttons and endpoint work only with `SHAMSY_DEMO_LOGIN_ENABLED=true`; otherwise manual login remains available. Vercel stores the four account values as sensitive server-only variables. This is intentionally public access to a fictional tenant, including real owner permissions; disable it for real business data.

Verified on 24 September 2026:

- `npm run lint` and `npm run typecheck` — passed.
- `npm test` — **23/23** finance and demo-login route tests passed.
- `npm run test:db` — **PostgreSQL RLS and finance checks passed**.
- `node --env-file=.env.hosted.local node_modules/.bin/playwright test` — **6/6** passed against the local app and hosted Supabase. This includes distinct real account sessions, refresh/sign-out, adviser rejection with no saved row, owner approval, changed-input rejection, password exposure checks, and 390px layout.
- `SHAMSY_DEMO_LOGIN_ENABLED=false node --env-file=.env.hosted.local node_modules/.bin/playwright test tests/e2e/demo-access.spec.ts -g 'demo availability'` — **1/1** passed; manual login retained, demo buttons hidden, demo POST rejected.
- `node --env-file=.env.hosted.local -e 'require("node:child_process").execFileSync("npm", ["run", "build"], {stdio:"inherit", env:process.env})'` — production build passed.
- `node --env-file=.env.hosted.local scripts/check-demo-secret-exposure.mjs` — passed; actual passwords absent from repository files, generated browser assets/source maps, and public environment values.
- `PLAYWRIGHT_BASE_URL=https://shamsy-order-foundation-demo.vercel.app node --env-file=.env.hosted.local node_modules/.bin/playwright test` — **6/6 passed (19.2s)** on the deployed app, including both one-click accounts and the existing manual-login worked example.
- `PROOF_BASE_URL=https://shamsy-order-foundation-demo.vercel.app node --env-file=.env.hosted.local scripts/prove-server-enforcement.mjs` — **7 reported checks passed**, including **403 OWNER_APPROVAL_REQUIRED; 0 persisted orders**. Direct table writes and forged owner approvals were also rejected. The current rate was restored to 8,200 afterward.

The public demo is [shamsy-order-foundation-demo.vercel.app](https://shamsy-order-foundation-demo.vercel.app). The linked Supabase project retains all four migrations; this login change needs no schema changes. A slow initial rate fetch can no longer overwrite an adviser's typed rate.

For the full build: add tenant onboarding, a separate owner-only cost-price relation, server-managed draft revisions if reverting an edited line must also invalidate an approval, receipt/conversion snapshots, and accounting-close controls. Confirm whether SDG needs subunit precision and whether owner approval should expire after a time limit. The trial treats SDG as whole units and exact line inputs as the approval identity.
