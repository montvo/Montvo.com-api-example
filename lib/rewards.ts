import "server-only";

/*
 * STAND-IN FOR YOUR DATABASE.
 *
 * This keeps rewards in memory so the example runs without any setup. It is
 * lost on every restart, and on Vercel each serverless instance has its own
 * copy, so do not ship it. Replace it with a table that has a UNIQUE
 * constraint on the token. Then the reward is written once, even if two
 * requests race.
 */

export type Reward = { token: string; ticket: string; grantedAt: string };

const store = ((globalThis as { __montvoRewards?: Map<string, Reward> }).__montvoRewards ??= new Map());

export async function grantReward(token: string, ticket: string): Promise<Reward> {
  const existing = store.get(token);
  if (existing) return existing;
  const reward = { token, ticket, grantedAt: new Date().toISOString() };
  store.set(token, reward);
  return reward;
}

export async function findRewardForTicket(ticket: string): Promise<Reward | null> {
  for (const reward of store.values()) if (reward.ticket === ticket) return reward;
  return null;
}
