import type { Metadata } from "next";
import { Notify } from "./notify";

/*
 * Where the Montvo link sends the visitor once they finish, in the tab the
 * gate was opened in. It doesn't check or claim anything itself: the tab they
 * started in does that, by ticket. This page only tells that tab to look now.
 *
 * Montvo adds ?montvo_token=… to the address. This flow doesn't need it, but
 * the referrer policy keeps it from leaking to anything the page links to.
 */

export const metadata: Metadata = {
  title: "Done",
  referrer: "no-referrer",
};

export default function UnlockedPage() {
  return (
    <main>
      <Notify />
      <h1>Done. Go back to the first tab.</h1>
      <p className="lede">Your unlock is finished. The tab you started in is checking it now, and your reward will be there. You can close this tab.</p>
      <p className="muted">
        Closed that tab? <a href="/">Continue here</a>. It picks up where you left off.
      </p>
    </main>
  );
}
