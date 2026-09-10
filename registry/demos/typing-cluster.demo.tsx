"use client";

import * as React from "react";

import { TypingCluster } from "@/registry/ui/typing-cluster";

const ROSTER = ["Marta Vieira", "Rui Sequeira", "Ines Barbosa", "Nuno Peixe"];

/** A seeded timeline: who is typing at each beat, in order. */
const SCRIPT: { after: number; typing: string[] }[] = [
  { after: 600, typing: ROSTER.slice(0, 1) },
  { after: 1500, typing: ROSTER.slice(0, 2) },
  { after: 1500, typing: ROSTER.slice(0, 3) },
  { after: 3400, typing: ROSTER.slice(1, 3) },
  { after: 1600, typing: [] },
];

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TypingClusterDemo() {
  // Two typers at rest, so the strip shows the pre-merge state on arrival.
  const [typing, setTyping] = React.useState<string[]>(ROSTER.slice(0, 2));
  const [spread, setSpread] = React.useState(false);
  const [shown, setShown] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<number | null>(null);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // One timer per beat; a hidden tab holds the script where it stands.
  React.useEffect(() => {
    if (stage === null || !visible) return;
    const step = SCRIPT[stage];
    if (!step) return;
    const timer = window.setTimeout(() => {
      setTyping(step.typing);
      setStage(stage + 1 < SCRIPT.length ? stage + 1 : null);
    }, step.after);
    return () => window.clearTimeout(timer);
  }, [stage, visible]);

  const addTyper = () => {
    setStage(null);
    const next = ROSTER.find((name) => !typing.includes(name));
    if (next) setTyping([...typing, next]);
  };
  const first = shown ? (shown.split(" ")[0] ?? shown) : null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TypingCluster
        label="Coldbrook depot, dispatch"
        typing={typing}
        expanded={spread}
        onExpandedChange={setSpread}
        onFocusNameChange={setShown}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTyping([]);
            setStage(0);
          }}
          disabled={stage !== null}
          className={chip}
        >
          Play script
        </button>
        <button
          type="button"
          onClick={addTyper}
          disabled={typing.length >= ROSTER.length}
          className={chip}
        >
          Add typer
        </button>
        <button
          type="button"
          onClick={() => {
            setStage(null);
            setTyping(typing.slice(0, -1));
          }}
          disabled={typing.length === 0}
          className={chip}
        >
          Stop one
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {typing.length === 0 ? (
          <>Quiet · nobody typing</>
        ) : (
          <>
            {typing.length} typing ·{" "}
            <span className="text-signal">
              {typing.length < 3
                ? typing.map((name) => name.split(" ")[0]).join(", ")
                : spread
                  ? "spread"
                  : `merged · showing ${first ?? "—"}`}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
