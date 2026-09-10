"use client";

import * as React from "react";

import {
  LinkUnfurl,
  type LinkPreview,
  type LinkUnfurlState,
} from "@/registry/ui/link-unfurl";

const URL = "https://basinworks.example/status/quay-4";

/** What the fetch comes back with; the seed draws the thumbnail. */
const PREVIEW: LinkPreview = {
  title: "Basinworks Status · Quay 4",
  description:
    "Shore power on quay 4 is down for maintenance until 14:00. Cranes run on the reserve feed.",
  domain: "basinworks.example",
  seed: 24,
};

/** How long the invented fetch takes. */
const FETCH_MS = 900;

export function LinkUnfurlDemo() {
  const [state, setState] = React.useState<LinkUnfurlState>("idle");
  const [note, setNote] = React.useState("no preview");

  // The wait is the demo's: one timeout, cleaned up, and held while the tab
  // is hidden so a backgrounded page never resolves behind your back.
  React.useEffect(() => {
    if (state !== "fetching") return;
    let timer = 0;
    const start = () => {
      timer = window.setTimeout(() => setState("ready"), FETCH_MS);
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [state]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LinkUnfurl
        label="Ops thread with Ines"
        peerName="Ines"
        text="Dock power is out again — status page says the same."
        url={URL}
        time="11:07"
        state={state}
        preview={PREVIEW}
        onUnfurled={() => setNote("ready · basinworks.example")}
        onOpen={() => setNote("opened · basinworks.example")}
        onRemove={() => {
          setState("idle");
          setNote("removed");
        }}
        onRetry={() => setState("fetching")}
      />

      <button
        type="button"
        onClick={() => {
          setState("fetching");
          setNote("fetching");
        }}
        disabled={state === "fetching" || state === "ready"}
        className="h-9 self-start rounded-3 border border-hairline-strong px-3 text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-cobalt-wash disabled:opacity-50"
      >
        Paste link
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note}</span>
      </p>
    </div>
  );
}
