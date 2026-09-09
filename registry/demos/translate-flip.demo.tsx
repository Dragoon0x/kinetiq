"use client";

import * as React from "react";

import { TranslateFlip } from "@/registry/ui/translate-flip";

/** Both languages are invented, and so is the message: no real sentence is
 *  dressed up here as the output of a translation service. */
const SOURCE = { code: "CDR", name: "Cadran" };
const TARGET = { code: "MRN", name: "Marin" };
const ORIGINAL =
  "Dokka trei vandre nove uur. Pallets Basinworks kunn gaan mit morgen-run, twe stukk.";
const TRANSLATION =
  "Dock three opens at nine. The Basinworks pallets can go with the morning run, two of them.";
const WAIT_MS = 900;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TranslateFlipDemo() {
  const [pending, setPending] = React.useState(false);
  const [showing, setShowing] = React.useState(false);
  const [foldOpen, setFoldOpen] = React.useState(false);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The wait is the demo's, not the component's: nothing in the card reads a
  // clock, and a hidden tab holds the request where it stands.
  React.useEffect(() => {
    if (!pending || !visible) return;
    const timer = window.setTimeout(() => {
      setPending(false);
      setShowing(true);
    }, WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [pending, visible]);

  const status = pending
    ? "working"
    : showing
      ? `showing ${TARGET.name.toLowerCase()} · ${foldOpen ? "original open" : "original folded"}`
      : `showing ${SOURCE.name.toLowerCase()}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TranslateFlip
        label="Basinworks yard"
        author="Rui Baptista"
        time="09:12"
        text={ORIGINAL}
        translation={TRANSLATION}
        source={SOURCE}
        target={TARGET}
        pending={pending}
        translated={showing}
        onTranslatedChange={setShowing}
        originalOpen={foldOpen}
        onOriginalOpenChange={setFoldOpen}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || showing}
          onClick={() => setPending(true)}
          className={chip}
        >
          Ask for a translation
        </button>
        <button
          type="button"
          disabled={!showing && !pending}
          onClick={() => {
            setPending(false);
            setShowing(false);
            setFoldOpen(false);
          }}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{status}</span>
      </p>
    </div>
  );
}
