"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard blocked (http on a non-localhost host, or a denied permission): the text is right there to select.
    }
  }

  return (
    <button className="button small" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
