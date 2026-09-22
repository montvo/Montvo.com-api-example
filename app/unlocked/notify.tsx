"use client";

import { useEffect } from "react";
import { UNLOCK_CHANNEL } from "@/lib/channel";

/** Tells the tab the visitor started in to check now, instead of waiting for them to switch back. */
export function Notify() {
  useEffect(() => {
    const channel = new BroadcastChannel(UNLOCK_CHANNEL);
    channel.postMessage("finished");
    channel.close();
  }, []);
  return null;
}
