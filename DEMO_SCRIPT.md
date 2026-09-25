# Five-minute Loom sequence

1. **0:00–0:35** Click **Continue as Sales Adviser**, point to the authenticated role indicator, and load the worked example at 8,200. Point to 1.94% sand, 4.32% red, 7.25% blocked, and $5,490 / 45,018,000 SDG preview.
2. **0:35–1:00** Click Save. Show `OWNER_APPROVAL_REQUIRED`.
3. **1:00–1:40** In a terminal with test credentials already loaded, run `npm run prove` against the same deployed app. Pause on `403 OWNER_APPROVAL_REQUIRED; 0 persisted orders`. This direct request bypasses React. Run `npm run reset:rate` immediately afterward so the later rate change is visible.
4. **1:40–2:05** Open `create_shamsy_order` in the SQL migration. Show database price lookup, the >5% approval match, and the atomic insert. Keep the code view brief.
5. **2:05–2:25** Run `npm test && npm run test:db`; show the actual passing output.
6. **2:25–3:10** Sign out; click **Continue as Owner**. The draft is still present. Approve the exact 7.25% line. Sign out and click **Continue as Sales Adviser**; save successfully. These buttons authenticate separate real Supabase users.
7. **3:10–3:45** Open saved order: $5,490 and 45,018,000 SDG. Sign in as owner, set current rate to 9,000, reload order, and show its 8,200 snapshot and unchanged totals.
8. **3:45–4:10** Optionally start a fresh draft, approve a line, change its discount to $160, and show the blocked state again.
9. **4:10–4:30** Show the 390px viewport and the usable total/save controls. End on the saved order.

The client needs only the public URL; the one-click buttons handle authentication without revealing passwords. For the terminal proof, prepare the environment privately with `set -a; source .env.hosted.local; set +a; export PROOF_BASE_URL=https://shamsy-order-foundation-demo.vercel.app`. Do not display the environment file during the recording. The proof creates its own order and sets the current rate to 9,000, so run `npm run reset:rate` afterward if you want the default back at 8,200.
