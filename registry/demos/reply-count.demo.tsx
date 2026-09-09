"use client";

import * as React from "react";

import { ReplyCount, type ReplyEntry } from "@/registry/ui/reply-count";

/** A seeded reply script; the component never invents an arrival. */
const SCRIPT: ReplyEntry[] = [
  { id: "r1", name: "Marta Ferreira", at: "14:41" },
  { id: "r2", name: "Rui Baptista", at: "14:46" },
  { id: "r3", name: "Tomas Lindqvist", at: "14:52" },
  { id: "r4", name: "Marta Ferreira", at: "14:58" },
  { id: "r5", name: "Noor Haddad", at: "15:03" },
  { id: "r6", name: "Rui Baptista", at: "15:09" },
  { id: "r7", name: "Lea Okafor", at: "15:14" },
];
/** Replies already in the thread when the demo opens. */
const SEEDED = 2;
const STEP_MS = 900;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ReplyCountDemo() {
  const [count, setCount] = React.useState(SEEDED);
  const [seen, setSeen] = React.useState(SEEDED);
  const [requested, setRequested] = React.useState(false);
  const [opened, setOpened] = React.useState(0);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
  const playing = requested && count < SCRIPT.length;

  React.useEffect(() => {
    if (!playing || !visible) return;
    const timer = window.setTimeout(
      () => setCount((prev) => Math.min(SCRIPT.length, prev + 1)),
      STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, visible, count]);

  const replies = SCRIPT.slice(0, count);
  const last = replies[replies.length - 1];
  const unread = count - Math.min(seen, count);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReplyCount
        label="Coldbrook dispatch"
        author="Ines Moreau"
        time="14:38"
        text="Who is covering the Basinworks run on Friday? Dock three needs a name by noon."
        replies={replies}
        seenCount={seen}
        onSeenCountChange={setSeen}
        onOpen={() => setOpened((n) => n + 1)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={count >= SCRIPT.length}
          onClick={() => setCount((prev) => Math.min(SCRIPT.length, prev + 1))}
          className={chip}
        >
          One more reply
        </button>
        <button
          type="button"
          disabled={playing}
          onClick={() => {
            if (count >= SCRIPT.length) {
              setCount(SEEDED);
              setSeen(SEEDED);
            }
            setRequested(true);
          }}
          className={chip}
        >
          {count >= SCRIPT.length ? "Replay" : "Let them answer"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {count === 0 ? "no replies yet" : `${count} replies`} ·{" "}
        <span className="text-signal">
          {last ? `last ${last.name.split(" ")[0]} ${last.at}` : "quiet"}
        </span>{" "}
        · {unread === 0 ? "all read" : `${unread} new`}
        {opened > 0 ? ` · opened ${opened}` : ""}
      </p>
    </div>
  );
}
