"use client";

import * as React from "react";

import { PinnedBar, type PinnedNote } from "@/registry/ui/pinned-bar";

const note = (
  id: string,
  author: string,
  time: string,
  text: string,
): PinnedNote => ({ id, author, time, text });

const PINS: PinnedNote[] = [
  note(
    "closure",
    "Ines Moreau",
    "14:38",
    "Coldbrook depot closes Thursday from noon. Nothing leaves the yard after eleven.",
  ),
  note(
    "fee",
    "Marta Ferreira",
    "14:52",
    "Waylight Pay reference for the yard fee is 4471-CB. Put it on the sheet.",
  ),
  note(
    "dock",
    "Rui Baptista",
    "15:11",
    "Dock three is free from nine, and the loader is booked until half past.",
  ),
];

/** A seeded pool, walked by index — no clock, no randomness. */
const SPARES: PinnedNote[] = [
  note(
    "keys",
    "Rui Baptista",
    "15:26",
    "Loader keys live on the hook by the office.",
  ),
  note(
    "returns",
    "Marta Ferreira",
    "15:40",
    "Fernworks returns go out Friday, three crates.",
  ),
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function PinnedBarDemo() {
  const [pins, setPins] = React.useState<PinnedNote[]>(PINS);
  const [index, setIndex] = React.useState(0);
  const [step, setStep] = React.useState(0);

  const pinAnother = () => {
    const spare = SPARES[step % SPARES.length];
    if (!spare) return;
    setStep(step + 1);
    setIndex(pins.length);
    setPins([...pins, { ...spare, id: `${spare.id}-${step}` }]);
  };

  const shown =
    pins.length === 0 ? undefined : pins[Math.min(index, pins.length - 1)];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PinnedBar
        label="Pinned in Coldbrook yard"
        pins={pins}
        index={index}
        onIndexChange={setIndex}
        onUnpin={(id) => setPins(pins.filter((one) => one.id !== id))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={pinAnother} className={chip}>
          Pin another note
        </button>
        <button
          type="button"
          onClick={() => setPins([])}
          disabled={pins.length === 0}
          className={chip}
        >
          Clear the bar
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {shown
            ? `pin ${Math.min(index, pins.length - 1) + 1} of ${pins.length}`
            : "bar empty"}
        </span>
        {shown ? ` · ${shown.author}` : ""}
      </p>
    </div>
  );
}
