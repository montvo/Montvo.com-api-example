/*
 * The ticket: a one-time reference you issue before the visitor leaves.
 *
 * It goes out on the link as ?sub=<ticket>, and GET /unlocks?sub=<ticket>
 * answers whether that trip finished. The ticket lives in an httpOnly cookie,
 * so only the browser that set off can ask about it and collect the reward.
 *
 * One fresh ticket per attempt, never a user id: ?sub= is on a URL the
 * visitor can see and edit, and a reused value would also match older
 * unlocks. A random value used once can only match the trip it was made for.
 *
 * In a real app, store the ticket against the signed-in user in your own
 * database instead of (or as well as) the cookie.
 */

export const TICKET_COOKIE = "montvo_ticket";

/** Montvo keeps a completion for 24 hours, so a ticket is no use for longer. */
export const TICKET_MAX_AGE_SECONDS = 24 * 60 * 60;

/** A UUID fits what Montvo accepts in ?sub=: letters, digits and _ . : @ -, at most 64 characters. */
export const newTicket = () => crypto.randomUUID();
