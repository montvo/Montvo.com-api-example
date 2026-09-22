"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UNLOCK_CHANNEL } from "@/lib/channel";
import { checkUnlock, startUnlock, type CheckOutcome } from "./actions";

const POLL_MS = 3_000;
/** Stop asking after this long without an answer. The visitor can ask again with a click. */
const GIVE_UP_MS = 15 * 60 * 1_000;

type Phase = "idle" | "opening" | "waiting" | "stalled" | "done";

export function UnlockPanel({ resume }: { resume: boolean }) {
  const [phase, setPhase] = useState<Phase>(resume ? "waiting" : "idle");
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await checkUnlock();
      setOutcome(next);
      if (next.status === "idle") setPhase("idle");
      else if (next.status === "error" ? !next.retry : next.status !== "waiting") setPhase("done");
    } finally {
      inFlight.current = false;
    }
  }, []);

  /*
   * While waiting: ask every few seconds, but only while this tab is visible.
   * The visitor is in the other tab for most of the wait, and asking the API
   * then would spend your rate limit on an answer nobody is looking at.
   * Instead the page asks the moment they come back, and the /unlocked page
   * pings it over a BroadcastChannel as soon as they finish.
   */
  useEffect(() => {
    if (phase !== "waiting") return;
    const startedAt = Date.now();
    const visible = () => document.visibilityState === "visible";

    if (visible()) void check();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > GIVE_UP_MS) return setPhase("stalled");
      if (visible()) void check();
    }, POLL_MS);

    const onReturn = () => visible() && void check();
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    const channel = new BroadcastChannel(UNLOCK_CHANNEL);
    channel.onmessage = () => void check();

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      channel.close();
    };
  }, [phase, check]);

  async function open() {
    setProblem(null);
    setOutcome(null);
    setPhase("opening");

    /*
     * Open the tab now, inside the click, and point it at the link once the
     * server has issued the ticket. Browsers only allow window.open during
     * the click itself. Opening it after an await gets it blocked as a popup.
     */
    const tab = window.open("", "_blank");
    // The gate must not be able to reach back into this page.
    if (tab) tab.opener = null;

    const started = await startUnlock();
    if ("error" in started) {
      tab?.close();
      setProblem(started.error);
      setPhase("idle");
      return;
    }

    // Popup blocked anyway: go in this tab. /unlocked links back here, and this page picks the ticket up again.
    if (!tab) return window.location.assign(started.link);
    tab.location.href = started.link;
    setPhase("waiting");
  }

  return (
    <>
      <p className="actions">
        {/* Stays clickable while waiting: a second click is a fresh ticket, which is how a visitor starts over. */}
        <button className="button primary" onClick={open} disabled={phase === "opening"}>
          {phase === "idle" ? "Unlock with Montvo" : phase === "waiting" ? "Open the link again" : "Unlock again"}
        </button>
        {phase === "waiting" && (
          <button className="button" onClick={() => void check()}>
            I&apos;m done, check now
          </button>
        )}
      </p>

      {problem && <Card tone="bad" title="Can't start" text={problem} />}
      {phase === "opening" && <Card tone="wait" title="Opening Montvo in a new tab…" text="" />}
      {phase === "waiting" && (outcome?.status === "waiting" || !outcome) && (
        <Card tone="wait" title="Waiting for your unlock…" text="Finish the steps in the other tab. This page checks as soon as you're back." spinner />
      )}
      {phase === "stalled" && (
        <Card tone="wait" title="Still waiting." text="We stopped checking after 15 minutes. Finished? Check again.">
          <p>
            <button className="button" onClick={() => setPhase("waiting")}>
              Check again
            </button>
          </p>
        </Card>
      )}
      {outcome && <Result outcome={outcome} />}
    </>
  );
}

function Result({ outcome }: { outcome: CheckOutcome }) {
  switch (outcome.status) {
    case "idle":
    case "waiting":
      return null;
    case "granted":
      return (
        <Card tone="ok" title="Unlocked. Your reward is yours." text="The visit was verified and paid, and it can't be claimed again.">
          <dl>
            <dt>Ticket (sub)</dt>
            <dd>{outcome.unlock.sub}</dd>
            <dt>Link</dt>
            <dd>{outcome.unlock.short_url}</dd>
            <dt>Country / device</dt>
            <dd>
              {outcome.unlock.country} / {outcome.unlock.device}
            </dd>
            <dt>Finished</dt>
            <dd>{new Date(outcome.unlock.completed_at).toLocaleString()}</dd>
          </dl>
        </Card>
      );
    case "already-yours":
      return (
        <Card
          tone="ok"
          title="Already unlocked."
          text={outcome.grantedAt ? `You got this reward on ${new Date(outcome.grantedAt).toLocaleString()}.` : "This unlock was already claimed for you."}
        />
      );
    case "not-billable":
      return (
        <Card tone="bad" title="This visit didn't qualify." text="It reached the end, but it didn't pass Montvo's traffic checks, so there is no reward. You can try again.">
          {/* Testing hint for you, not your visitors. Remove before going live. */}
          <p className="hint">
            <strong>Testing your own link?</strong> This is expected if you went through the same link more than once. Montvo pays for one unlock per IP
            address per link every 24 hours, and later runs count as repeats. Test with a different link or network (mobile data works), or wait 24 hours.
            A popup blocker stopping the ad window, or a VPN, also makes a visit not billable.
          </p>
        </Card>
      );
    case "error":
      return (
        <Card
          tone="bad"
          title={outcome.retry ? "Having trouble reaching Montvo…" : "Something went wrong on our side."}
          text={outcome.retry ? "Still trying." : "Please try again later. (Site owner: the server log and /diagnostics have the details.)"}
        />
      );
  }
}

function Card({ tone, title, text, spinner, children }: { tone: "ok" | "bad" | "wait"; title: string; text: string; spinner?: boolean; children?: React.ReactNode }) {
  return (
    <section className={`card ${tone}`} aria-live="polite">
      <h2>
        {spinner && <span className="spinner" aria-hidden />}
        {title}
      </h2>
      {text && <p>{text}</p>}
      {children}
    </section>
  );
}
