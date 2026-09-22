# Montvo unlock example

A small Next.js (React) app that verifies a Montvo unlock on your own server before handing out a reward. It deploys to Vercel as is.

The visitor opens the Montvo link in a **new tab**. The page they started on waits, and checks with Montvo whether they finished.

```
 tab 1: your page                                  tab 2
 ────────────────                                  ─────
 [Unlock with Montvo] ──▶ server: new ticket ──▶ montvo.link/your-slug?sub=<ticket> ──▶ gate ──▶ /unlocked
        │                 (httpOnly cookie)                                                        │
        │                                                                     "go back to tab 1" + ping
        ▼                                                                                          │
 waiting… ◀──────────────────────────────────── checks when visible, when you return, and on the ping
        │
        ▼
 server: GET /unlocks?sub=<ticket> ▸ billable? ▸ POST /unlocks/:token/claim ▸ reward
```

## The rules it follows

1. **The secret key stays on the server.** Every API call is in `lib/montvo.ts`, which imports `server-only`, so the build fails if browser code ever imports it. Never put the key in a `NEXT_PUBLIC_` variable.
2. **One fresh ticket per attempt.** The button asks the server for a random `sub`, which is stored in an httpOnly cookie before the tab opens. Don't use a user id as `sub`: the visitor can see and edit it in the address bar, and a reused value also matches older unlocks.
3. **Reward on `billable`, not `completed`.** `completed` is also true for a bot that sat through the ads. `billable` means an advertiser paid for the visit.
4. **Claim before you reward.** `POST /unlocks/:token/claim` succeeds exactly once and answers `409` after that. Two tabs, a refresh or a double click can't pay out twice.
5. **Don't poll a tab nobody is looking at.** Each check is one API call, and a secret key allows 600 calls a minute. The page checks every 3 seconds only while it's visible, right away when the visitor comes back, and when `/unlocked` pings it over a `BroadcastChannel`. After 15 minutes it stops and offers a button.

The check is in [`app/actions.ts`](app/actions.ts). The tab handling is in [`app/unlock-panel.tsx`](app/unlock-panel.tsx).

## Setup

1. Copy `.env.example` to `.env.local` and fill it in:
   - `MONTVO_SECRET_KEY`: your **secret** key (`sk_live_…`) from Montvo → Developers. The site key won't work.
   - `MONTVO_LINK`: the short link, e.g. `https://montvo.link/your-slug`.
2. Run it:
   ```bash
   npm install
   npm run dev
   ```
3. Open http://localhost:3000. The **Setup** box shows the exact address to use as your link's destination (`http://localhost:3000/unlocked` locally, `https://<your-app>.vercel.app/unlocked` on Vercel). `localhost` works, because the redirect happens in your own browser.
4. On Vercel, import the repo and add the same two variables under Project → Settings → Environment Variables.

**Use a separate test link.** Pointing a link real visitors use at your test app sends them there. You don't have to change the destination to test the check, though: it asks about the ticket, not the page. With any destination, finish the gate, go back to the first tab, and it checks.

**Your second test run won't be billable.** Montvo pays for one unlock per IP address per link every 24 hours, and later runs through the same link from the same connection count as repeats (`billable: false`). To test again, use a different link or network (mobile data works), or wait 24 hours. A popup blocker that stops the ad window, or a VPN, also makes a visit not billable.

Open `/diagnostics` on the deployed app to check that the server can reach the API with your key. It calls `GET /me` from where the app runs, which is the test that counts: a call that works from your laptop can still fail from a cloud provider.

## What each answer means

| Where | Answer | Meaning |
|---|---|---|
| `GET /unlocks?sub=` | `completed: false` | Nobody has finished under this ticket yet. Keep waiting. |
| | `completed: true, billable: false` | Finished, but it didn't pass the traffic checks. No reward. While testing, this is almost always the 24-hour repeat rule (below). |
| | `billable: true` | Claim the billable entry in `data`. |
| `POST …/claim` | `200` | It's yours. Grant the reward. |
| | `409` | Already claimed. |
| any | `401` | Wrong key, or the site key where the secret key is needed. |
| any | `429` | More than 600 calls a minute. Wait for `Retry-After`. |
| any | `403`, HTML, not JSON | Something in front of the API answered, not the API. It always answers JSON. Send the `cf-ray` header to Montvo support. |

## Before you ship

- `lib/rewards.ts` keeps rewards **in memory**, only so the example runs without setup. Replace it with a database table that has a unique constraint on the token.
- Delete the Setup box in `app/page.tsx`, and the "Testing your own link?" hint in `app/unlock-panel.tsx`.
- An unlock can be checked and claimed for **24 hours** after the visitor finishes.
- Polling tops out at around 30 visitors waiting at once per key. Past that, receive the signed `unlock.recorded` webhook, which includes the ticket as `sub`, and use polling only as a fallback. See https://montvo.com/docs/api/verify.
