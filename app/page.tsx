import { cookies, headers } from "next/headers";
import { CopyButton } from "./copy-button";
import { UnlockPanel } from "./unlock-panel";
import { TICKET_COOKIE } from "@/lib/ticket";

export default async function Home() {
  const configured = Boolean(process.env.MONTVO_LINK && process.env.MONTVO_SECRET_KEY);
  // A ticket already in this browser: the visitor went through the link in this tab
  // (popup blocked) or closed this tab while waiting. Pick up where they left off.
  const resume = (await cookies()).has(TICKET_COOKIE);
  const destination = `${await origin()}/unlocked`;

  return (
    <main>
      <h1>Get the reward</h1>
      <p className="lede">
        Open the Montvo link in a new tab and finish it. This page checks on our server whether you did, and unlocks the reward once.
      </p>

      {configured ? (
        <UnlockPanel resume={resume} />
      ) : (
        <section className="card bad">
          <h2>Not configured yet</h2>
          <p>
            Set <code>MONTVO_SECRET_KEY</code> and <code>MONTVO_LINK</code> in <code>.env.local</code> (or in your Vercel project settings), then reload.
          </p>
        </section>
      )}

      <section className="card setup">
        <p className="eyebrow">Setup · for you, not your visitors · remove before going live</p>
        <h2>Where to point your Montvo link</h2>
        <p>In Montvo, set the destination of the link you&apos;re testing with to:</p>
        <p className="copy-row">
          <code>{destination}</code>
          <CopyButton text={destination} />
        </p>
        <p>
          Visitors land there when they finish the gate. That page tells them to go back to this tab and nudges this tab to check right away.
          localhost works too: the redirect happens in your own browser, so Montvo never has to reach your machine.
        </p>
        <dl>
          <dt>Link in use</dt>
          <dd>{process.env.MONTVO_LINK ? <code>{process.env.MONTVO_LINK}</code> : "not set"}</dd>
          <dt>Secret key</dt>
          <dd>{process.env.MONTVO_SECRET_KEY ? "set" : "not set"}</dd>
        </dl>
        <p className="muted">
          The check itself works with any destination, because it asks about the ticket (<code>?sub=</code>), not about the page the visitor lands on. Use a
          separate test link, not one real visitors are using. Can&apos;t reach the API from the server? <a href="/diagnostics">Run the connection check</a>.
        </p>
      </section>

      <h2>What happens</h2>
      <ol className="steps">
        <li>
          The button asks our server for a one-time ticket, keeps it in an httpOnly cookie, and opens <code>montvo.link/…?sub=&lt;ticket&gt;</code> in a new
          tab.
        </li>
        <li>
          While you&apos;re in that tab, this page waits. When you come back (or reach <code>/unlocked</code>), our server calls{" "}
          <code>GET /unlocks?sub=&lt;ticket&gt;</code> with the secret key.
        </li>
        <li>
          If a completion is there and <code>billable</code> is true, it claims it with <code>POST /unlocks/:token/claim</code>, which only succeeds once, and
          grants the reward.
        </li>
      </ol>
    </main>
  );
}

/** This app's own address, as the visitor's browser sees it (on Vercel, behind its proxy). */
async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
