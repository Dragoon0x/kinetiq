"use client";

import * as React from "react";

import { ReadWave, type ReadReader } from "@/registry/ui/read-wave";

const SCRIPT: ReadReader[] = [
  { id: "marta", name: "Marta Ferreira", at: "15:02" },
  { id: "rui", name: "Rui Baptista", at: "15:04" },
  { id: "tomas", name: "Tomas Lindqvist", at: "15:09" },
  { id: "lea", name: "Lea Okafor", at: "15:11" },
  { id: "noor", name: "Noor Haddad", at: "15:15" },
];
/** Readers already there when the demo opens; the rest arrive on Play. */
const SEEDED = 2;
const STEP_MS = 900;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;
const useVisible = () =>
  React.useSyncExternalStore(subscribeVisibility, getVisible, getServerVisible);

export function ReadWaveDemo() {
  const [count, setCount] = React.useState(SEEDED);
  const [requested, setRequested] = React.useState(false);
  const visible = useVisible();
  const playing = requested && count < SCRIPT.length;

  // Arrivals are a seeded script fed through the readers prop, one per
  // step, and a hidden tab holds the script where it stands.
  React.useEffect(() => {
    if (!playing || !visible) return;
    const timer = window.setTimeout(
      () => setCount((prev) => Math.min(SCRIPT.length, prev + 1)),
      STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, visible, count]);

  const readers = SCRIPT.slice(0, count);
  const last = readers[readers.length - 1];
  const done = count >= SCRIPT.length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReadWave
        label="Release channel"
        text="Fieldline 2.4 ships at 16:00. Objections before 15:30, please."
        time="14:58"
        readers={readers}
        total={SCRIPT.length}
        maxAvatars={4}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={playing}
          onClick={() => {
            if (done) setCount(SEEDED);
            setRequested(true);
          }}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {done ? "Replay" : "Let the rest read"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Seen by {count} of {SCRIPT.length} ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {last ? `last ${last.name.split(" ")[0]} ${last.at}` : "nobody yet"}
        </span>
      </p>
    </div>
  );
}
