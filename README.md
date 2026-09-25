# Shamsy Operations — order entry trial

Next.js 16 App Router, TypeScript, Tailwind, Supabase Auth, PostgreSQL, and RLS. The browser keeps only an unfinished draft. A saved order is a PostgreSQL transaction with immutable financial snapshots.

## Boundary and business rules

`POST /api/orders` requires a Supabase access token. The route verifies it with Supabase Auth and calls `create_shamsy_order` using that user's JWT and the public anon key. It passes only identifiers, quantity, discount cents, and integer rate. The PostgreSQL function reads current product prices, recomputes discount thresholds and all totals, checks a database owner approval for any line above 5%, and inserts the order, lines, and audit event atomically. A failed call inserts nothing. There is no service-role key in this app.

`POST /api/approvals` calls `approve_order_discount`. The function reads the authenticated user's organization role, requires `owner`, and records draft key, line key, product, quantity, **database price**, discount, approver, and time. The save function requires all these fields to match. Changing a restricted line's financial inputs requires a fresh owner approval. A browser `approved` flag or claimed role has no effect on the database. A client-supplied price or total is ignored. Reusing an idempotency key returns the original saved order.

`orders` and `order_lines` have no authenticated direct insert/update/delete grant or write policy; immutable triggers reject updates and deletes even on privileged paths. Tenant RLS scopes reads. Owner-only RLS controls settings and catalogue writes. Adviser-visible `products` contains selling prices only; eventual cost prices must be stored in a separate owner-only relation, not added to this readable table.

USD values are integer cents. The rate is an integer **whole SDG per USD**. Order `total_sdg` is a whole SDG integer, calculated by the database as `(total_usd_cents * rate + 50) / 100` (round half up). The order and every line store the rate/price and resulting facts from save time. Current settings cannot rewrite historical facts.

## Setup

1. `npm ci`; copy `.env.example` to `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from a Supabase project. The anon/publishable key is public; never put a service-role key in `NEXT_PUBLIC_*`.
2. Apply all four files in `supabase/migrations/` in timestamp order in a fresh Supabase project, using `supabase db push` after linking the project. The migrations seed a fictional organization, three customers, four products, and the 8,200 current rate. The third migration revokes pending approvals whenever an owner changes a catalogue price, even if the price is later restored. The fourth locks product and approval rows during save so a concurrent edit cannot split validation from the saved facts.
3. In Supabase Auth, create two email/password users. In the SQL editor as administrator, use their actual Auth UUIDs:

   ```sql
   insert into public.organization_members (organization_id, user_id, role) values
     ('00000000-0000-4000-8000-000000000001', '<owner-auth-uuid>', 'owner'),
     ('00000000-0000-4000-8000-000000000001', '<adviser-auth-uuid>', 'sales_adviser');
   ```

4. `npm run dev`. Sign in as the adviser. To approve, sign out and sign in as the owner; the local draft survives the account switch. Then return to the adviser to save. This is a real role change through Supabase Auth.

### One-click fictional trial accounts

The deployed sign-in page offers **Continue as Sales Adviser** and **Continue as Owner**. No separately shared username/password is needed. These are two separate, server-side provisioned Supabase Auth users with real database memberships. The visible role indicator is derived from the authenticated membership. Sign out before choosing the other account; the unfinished draft is preserved.

To enable this on a dedicated trial deployment, set these **server-only** environment variables (never prefix them with `NEXT_PUBLIC_`):

```dotenv
SHAMSY_DEMO_LOGIN_ENABLED=true
SHAMSY_DEMO_ADVISER_EMAIL=<fictional adviser account>
SHAMSY_DEMO_ADVISER_PASSWORD=<private password>
SHAMSY_DEMO_OWNER_EMAIL=<fictional owner account>
SHAMSY_DEMO_OWNER_PASSWORD=<private password>
```

`POST /api/auth/demo-login` accepts only `{ "account": "adviser" }` or `{ "account": "owner" }`, validates the browser origin, and maps the selector to credentials on the server. It uses normal Supabase password authentication with the public anon key, verifies the account's active database membership, and returns a 303 redirect with standard Supabase SSR session cookies. It never returns the password. The selector does not grant a role. Existing bearer-token verification, RPC authorization, and RLS are unchanged. Session refresh uses the Supabase browser client; sign-out ends only the current session so other trial visitors are unaffected.

If the flag is absent or anything other than exactly `true`, the buttons are hidden and the demo POST returns 404. The manual login form remains. `GET /api/auth/demo-login` exposes only the availability boolean; responses are not cached. Keep the flag disabled on any production system containing real business data: this intentionally public trial grants visitors access to both fictional accounts, including the owner's actual trial permissions. Shared accounts share their tenant's saved orders.

For local database-only verification, `npm run test:db` starts a temporary PostgreSQL cluster, applies all migrations, runs `tests/sql/rls.sql` as owner/adviser identities, and removes the cluster. It needs `initdb`, `pg_ctl`, `pg_config`, and `psql`.

For a full local HTTP run, start Docker, run `npx supabase start`, then `npm run setup:local-proof`. That creates two disposable local Auth users and writes ignored `.env.local`. Run `npm run dev -- --hostname 127.0.0.1 --port 3100` in one terminal; in another run `node --env-file=.env.local scripts/prove-server-enforcement.mjs` and `node --env-file=.env.local node_modules/.bin/playwright test`.

## Direct adviser bypass proof

Put `PROOF_ADVISER_EMAIL`, `PROOF_ADVISER_PASSWORD`, `PROOF_OWNER_EMAIL`, and `PROOF_OWNER_PASSWORD` in your shell or ignored `.env.local`, and run the app. `PROOF_BASE_URL` defaults to `http://127.0.0.1:3100`; set it to the app URL if needed. Load the environment into the shell, then run:

```bash
set -a; source .env.local; set +a; npm run prove
```

The script signs into **both real Auth accounts**, tries a direct Supabase table insert, sends a direct adviser `POST /api/orders` with the 7.25% line, asserts HTTP **403 `OWNER_APPROVAL_REQUIRED`**, and queries PostgreSQL through RLS to assert zero rows for that draft key. It also tries a forged `role: "owner"` approval, obtains a real owner approval, checks a changed discount fails, checks 7,900 fails, saves the exact worked example, verifies authoritative $2,070 pricing and $5,490 / 45,018,000 SDG, retries the idempotency key, changes the current rate to 9,000 as owner, and reopens the saved 8,200 order.

## Tests and CI

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:e2e
npm run build
node --env-file=.env.hosted.local scripts/check-demo-secret-exposure.mjs
```

`tests/finance.test.ts` checks integer arithmetic and thresholds. `tests/demo-login.test.ts` exercises the enable flag, input/origin rejection, credential failures, membership checks, and successful cookie redirects. `tests/sql/rls.sql` proves the database transaction, RLS, role boundaries, price forgery resistance, approval binding, and immutable snapshots. Playwright checks unauthenticated API rejection and 390px overflow. Its manual authenticated flow requires `PROOF_*`; `tests/e2e/demo-access.spec.ts` verifies both one-click accounts against real Supabase, refresh/sign-out, adviser rejection with zero rows, owner approval, changed-input rejection, and no passwords in browser HTML/JS/network bodies. Authenticated cases explicitly skip when their configuration is unavailable. The secret scanner requires the actual private environment and a completed production build, and checks repository files, browser assets/source maps, and `NEXT_PUBLIC_*` values without printing credentials.

To verify disabled access locally with hosted Supabase configured: `SHAMSY_DEMO_LOGIN_ENABLED=false node --env-file=.env.hosted.local node_modules/.bin/playwright test tests/e2e/demo-access.spec.ts -g 'demo availability'`.

`.github/workflows/ci.yml` is configured to run lint, typecheck, unit, temporary PostgreSQL integration, unauthenticated Playwright, and build without secrets when pushed to GitHub. This checkout has no Git remote, so that workflow has not run in GitHub Actions. For full authenticated Playwright and `npm run prove` in CI, provision an isolated Supabase test project and provide its public URL/key and the two test account credentials as CI secrets. Never point destructive test setup at production.

## Deployment

The production trial is deployed at [shamsy-order-foundation-demo.vercel.app](https://shamsy-order-foundation-demo.vercel.app) against the dedicated hosted Supabase project `ngbowiyqapmlzzrikytg`. All four migrations are applied. Two fictional Auth accounts and role memberships are provisioned. Their credentials are in ignored `.env.hosted.local` and in sensitive server-only Vercel production variables. Vercel also has the public Supabase URL/anon key and the explicit demo-login flag. No service-role key is deployed or committed.

To reproduce the hosted proof: `PROOF_BASE_URL=https://shamsy-order-foundation-demo.vercel.app node --env-file=.env.hosted.local scripts/prove-server-enforcement.mjs`. Run the hosted mobile suite with `PLAYWRIGHT_BASE_URL=https://shamsy-order-foundation-demo.vercel.app node --env-file=.env.hosted.local node_modules/.bin/playwright test`. The proof sets the **current** rate to 9,000; restore the demo setting afterward with `PROOF_BASE_URL=https://shamsy-order-foundation-demo.vercel.app node --env-file=.env.hosted.local scripts/reset-demo-rate.mjs`. Historical orders stay unchanged.

For another deployment, link a Supabase project, push migrations, provision accounts, set the two public variables and optional server-only demo variables in Vercel, and run `npx vercel --prod --yes`. `scripts/setup-hosted-proof.mjs` and `scripts/configure-vercel.mjs` automate provisioning and Vercel configuration when the operator has Supabase CLI login and Vercel access. The latter sends credentials via stdin and marks them sensitive. Redeploy after changing environment variables. Both local and hosted setup scripts provision the fictional accounts and write the demo-login variables to their ignored environment file. The admin key is fetched only into process memory by the hosted setup script.

Trial scope: one seeded tenant, fixed catalogue, email/password demo identities, no stock/receipt/conversion modules, and no offline order outbox. Local draft recovery remains. A full build should add invitation/provisioning, private cost-price storage, explicit price-change audit, multi-tenant selection, accounting-period controls, and a defined rule for SDG fractional units if the business uses them.
