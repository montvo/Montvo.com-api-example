"use server";

import { cookies } from "next/headers";
import { claimUnlock, describeFailure, listUnlocks, type Unlock } from "@/lib/montvo";
import { findRewardForTicket, grantReward } from "@/lib/rewards";
import { newTicket, TICKET_COOKIE, TICKET_MAX_AGE_SECONDS } from "@/lib/ticket";

/**
 * Step 1: issue a fresh ticket and return the link to open.
 *
 * The ticket goes into an httpOnly cookie before the visitor leaves, so the
 * page that stays behind can ask about it, and nothing a visitor types can
 * change which ticket that is.
 */
export async function startUnlock(): Promise<{ link: string } | { error: string }> {
  const base = process.env.MONTVO_LINK;
  if (!base) return { error: "MONTVO_LINK is not set on the server." };

  const ticket = newTicket();
  (await cookies()).set(TICKET_COOKIE, ticket, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TICKET_MAX_AGE_SECONDS,
    path: "/",
  });

  const link = new URL(base);
  link.searchParams.set("sub", ticket);
  return { link: link.toString() };
}

export type CheckOutcome =
  /** No ticket in this browser: nothing has been started. */
  | { status: "idle" }
  /** Ticket issued, nobody has finished under it yet. */
  | { status: "waiting" }
  | { status: "granted"; unlock: Unlock; grantedAt: string }
  | { status: "already-yours"; grantedAt: string | null }
  | { status: "not-billable" }
  | { status: "error"; retry: boolean };

/**
 * Step 2: has the visitor finished? If so, claim it and grant the reward, once.
 *
 *   read    GET  /unlocks?sub=<ticket>   idempotent, safe to poll
 *   check   billable, not just completed
 *   claim   POST /unlocks/:token/claim   succeeds exactly once
 *   reward  write it to your database, keyed by the token
 *
 * Called by the page every few seconds while it's visible, and right away
 * when the visitor comes back to it.
 */
export async function checkUnlock(): Promise<CheckOutcome> {
  const jar = await cookies();
  const ticket = jar.get(TICKET_COOKIE)?.value;
  if (!ticket) return { status: "idle" };

  // A second tab, or a poll that arrived just after the reward was granted.
  const earlier = await findRewardForTicket(ticket);
  if (earlier) {
    jar.delete(TICKET_COOKIE);
    return { status: "already-yours", grantedAt: earlier.grantedAt };
  }

  // Read.
  const list = await listUnlocks(ticket);
  if (!list.ok) {
    console.error("[montvo] checking unlock:", describeFailure(list));
    // A timeout or a rate limit can clear up. A block or a wrong key won't.
    const retry = list.kind === "network" || (list.kind === "api" && (list.status === 429 || list.status >= 500));
    return { status: "error", retry };
  }
  const { completed, billable, data } = list.data;

  if (!completed) return { status: "waiting" };

  // `completed` is true even for a bot that sat through the ads.
  // `billable` means an advertiser paid, so it is the one a reward depends on.
  if (!billable) {
    jar.delete(TICKET_COOKIE);
    return { status: "not-billable" };
  }

  const unclaimed = data.find((unlock) => unlock.billable && !unlock.claimed);
  // Every billable completion under this ticket has been claimed already. Only this
  // server holds the secret key and only this browser holds the ticket, so it was claimed for them.
  if (!unclaimed) {
    jar.delete(TICKET_COOKIE);
    return { status: "already-yours", grantedAt: null };
  }

  // Claim. This is the guard against paying twice: only one request ever gets a 200.
  const claim = await claimUnlock(unclaimed.token);
  if (!claim.ok) {
    // Another poll from this browser won the claim a moment ago.
    if (claim.kind === "api" && claim.status === 409) {
      jar.delete(TICKET_COOKIE);
      return { status: "already-yours", grantedAt: null };
    }
    console.error("[montvo] claiming unlock:", describeFailure(claim));
    return { status: "error", retry: claim.kind === "network" };
  }

  // Reward. Montvo now answers 409 to any repeat, so this line runs once per token.
  // If the write can fail, make it retryable on your side (for example, insert a
  // "pending" row keyed by the token before claiming, and mark it done here).
  const reward = await grantReward(claim.data.token, ticket);
  jar.delete(TICKET_COOKIE);
  return { status: "granted", unlock: claim.data, grantedAt: reward.grantedAt };
}
