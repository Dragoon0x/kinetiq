"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countPatinaStale,
  defaultPatinaCards,
  defaultPatinaNow,
  defaultPatinaValue,
  PatinaBoard,
  type PatinaCard,
  type PatinaValue,
} from "@/registry/ui/patina-board";

export const tweaks = defineTweaks({
  patina: {
    kind: "choice",
    label: "Patina",
    default: "sepia",
    options: ["sepia", "fade", "dust"],
    names: { sepia: "Sepia", fade: "Fade", dust: "Dust" },
  },
  staleAfterDays: {
    kind: "range",
    label: "Stale after",
    default: 21,
    min: 3,
    max: 30,
    step: 1,
    unit: "d",
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const DAY = 86_400_000;

/**
 * Fieldline's job board on a Wednesday morning: fourteen jobs across three
 * columns, four of them untouched for weeks. Scrub a fortnight ahead and
 * watch the paper yellow; sweep the stale ones into the Archive.
 */
export function PatinaBoardDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [seed, setSeed] = React.useState(0);
  const [cards, setCards] = React.useState<PatinaCard[]>(defaultPatinaCards);
  const [value, setValue] = React.useState<PatinaValue>(defaultPatinaValue);
  const [scrub, setScrub] = React.useState(0);
  const [status, setStatus] = React.useState<"ready" | "loading" | "error">(
    "ready",
  );
  const [failNext, setFailNext] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <PatinaBoard height={540} {...values} />
      </div>
    );
  }

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setCards(defaultPatinaCards);
    setValue(defaultPatinaValue);
    setScrub(0);
    setStatus("ready");
    setFailNext(false);
    setSeed((s) => s + 1);
  };

  const staleAfterDays = values.staleAfterDays ?? tweaks.staleAfterDays.default;
  const stale = countPatinaStale(
    cards,
    value,
    defaultPatinaNow + scrub * DAY,
    staleAfterDays,
  );
  const archived = Object.values(value).filter((c) => c === "archive").length;

  const buttonClass =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <PatinaBoard
        key={seed}
        height={540}
        cards={cards}
        value={value}
        onChange={setValue}
        scrub={scrub}
        onScrubChange={setScrub}
        onTouch={(card, at) =>
          setCards((list) =>
            list.map((c) => (c.id === card.id ? { ...c, touchedAt: at } : c)),
          )
        }
        status={status}
        onRetry={load}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {scrub === 0 ? "viewing today" : `viewing +${scrub}d`} · {stale}{" "}
            stale
          </span>{" "}
          · {archived} archived
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} className={buttonClass}>
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={buttonClass}
          >
            Fail next load
          </button>
          <button type="button" onClick={reset} className={buttonClass}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
