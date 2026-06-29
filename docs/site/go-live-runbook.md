# Ultimate Tokens — Monetization go-live runbook

Everything that must happen to turn the **soft launch** (built, but nothing withheld) into a **hard
launch** (Pro features gated, only an active license unlocks them). Current state: `TIERS_ENFORCED` in
`src/engine/flags.js` is `false`; the store id (`420293`) and per-seat activation flow are already wired.

Do steps **1 and 2 yourself** (Lemon Squeezy dashboard + a CORS check I can't run). Then tell me and I
merge the prepared flip (step 3).

---

## 1. Lemon Squeezy dashboard config

License validation/activation only works if **license keys are enabled on each product** and the
**activation limits** match the seat model.

- [ ] **Enable license keys** on **both** products (Pro and Studio) — Product → *License keys* → enable.
      (Subscription products issue a key per subscription; the key's `status`/`expires_at` tracks the
      billing period, so a lapse auto-expires the key — which the app already honors.)
- [ ] **Pro — activation limit:** set to a small per-user device count (e.g. **3–5**), **not 1**. The
      store copy says "activate on any device you work from," and each device consumes one activation;
      a limit of 1 would block a user's second machine.
- [ ] **Studio — activation limit:** **5** (the base 5 seats). For the "+$19 / additional seat" add-ons,
      configure the variant/quantity so the activation limit rises with seats purchased (each extra seat
      = +1 activation). One Studio key, N activations = N seats.
- [ ] Confirm the **product/variant belongs to store 420293** (the app rejects keys from any other store).
- [ ] (Optional) Do a **test-mode** purchase first to get a real key for step 3's verification.

---

## 2. Confirm CORS (the one thing that can break activation for everyone)

The app validates/activates **from the browser**, directly against `api.lemonsqueezy.com`. If LS doesn't
send permissive CORS headers to your deployed origin, every activation fails with a network error and
nobody can unlock Pro. LS's license endpoints are built for client-side use, so this usually works — but
**verify it from the deployed origin before flipping enforcement.**

`curl` proves the endpoint works but **not** CORS (curl ignores it). Run this in the **browser console of
the deployed app** (so the request originates from your real origin):

```js
fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
  body: "license_key=cors-probe-not-a-real-key",
})
  .then((r) => r.json())
  .then((j) => console.log("✅ CORS OK — got a JSON body:", j))   // expect { valid:false, error:"license_key_not_found", ... }
  .catch((e) => console.error("❌ CORS BLOCKED:", e));            // a TypeError / CORS message = blocked
```

- **✅ CORS OK** (a JSON body, even `valid:false`) → activation will work; proceed to step 3.
- **❌ CORS BLOCKED** → front the three license calls with a tiny same-origin proxy (a serverless
  function that forwards to `api.lemonsqueezy.com/v1/licenses/*`), and point `LEMON_LICENSE_API` in
  `src/main.ts` at it. Tell me and I'll wire that instead.

---

## 3. Flip enforcement (I do this on your word)

One line: `TIERS_ENFORCED = true` in `src/engine/flags.js`, plus the handful of tests that assert the
pre-launch `false` default. I've **prepared this as a draft PR** (CI-green, not merged) so go-live is a
single merge once steps 1 & 2 are confirmed.

**Effect the moment it merges + deploys:**
- Free users → capped at **2 brand kits**, and `proExport` / `advancedTreatments` / `hostedMcp` turn off.
- Pro/Studio (activated license) → everything unlocked, per seat.
- A lapsed subscription / freed seat → auto-downgrade to Free (already wired via the entitlement re-check).

**Post-flip verification (use a real/test key from step 1):**
- [ ] A fresh browser (no license) shows Free limits (3rd kit blocked, Pro exports gated).
- [ ] Paste the key in **Settings → Account → Validate** → Pro unlocks; a 2nd device consumes a 2nd seat;
      at the limit, the (N+1)th device shows the friendly seat-limit message.
- [ ] **Remove** frees the seat (deactivation).
- [ ] The **Figma plugin** is unaffected (free + offline; no license UI there).

**Rollback:** flip `TIERS_ENFORCED` back to `false` and redeploy — instantly un-gates everyone, no data
change.

---

## Notes
- The Figma plugin stays free/offline regardless of this switch (the license UI is hidden when `inFigma`).
- Nothing here changes stored data; it only changes what the flag resolver withholds.
- See the engine seam: `resolveFlags`/`resolveTier`/`entitlementActive` in `src/engine/flags.js`, the web
  service in `src/main.ts`, and the Account UI in `src/ui/app.js`.
