"use client";

import * as React from "react";

import { HideVeil, type VeilMessage } from "@/registry/ui/hide-veil";

const say = (
  id: string,
  author: string,
  time: string,
  text: string,
  hiddenReason?: string,
): VeilMessage => ({ id, author, time, text, hiddenReason });

const THREAD: VeilMessage[] = [
  say(
    "a",
    "Ines Moreau",
    "07:40",
    "Dock two is loaded. Pallet 4471 still held.",
  ),
  say(
    "b",
    "Rui Baptista",
    "08:12",
    "Whoever packed 4471 cannot count. Useless.",
    "Coldbrook room rule 3: keep it civil.",
  ),
  say("c", "Marta Ferreira", "08:31", "Waylight Pay cleared it a minute ago."),
  say(
    "d",
    "Ines Moreau",
    "08:33",
    "Good. Paperwork is on the desk by the hook.",
  ),
  say("e", "Rui Baptista", "08:40", "Taking dock three from nine then."),
  say("f", "Marta Ferreira", "08:44", "Coldbrook closes Thursday from noon."),
  say("g", "Ines Moreau", "08:51", "Nothing leaves the yard after eleven."),
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function HideVeilDemo() {
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = React.useState<string[]>([]);
  const [cause, setCause] = React.useState("");

  const hiddenCount = THREAD.filter(
    (message) => message.hiddenReason && !shown.includes(message.id),
  ).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HideVeil
        label="Coldbrook depot thread"
        messages={THREAD}
        revealed={shown}
        onRevealedChange={setShown}
        onRevealChange={(_id, revealed, why) =>
          setCause(
            revealed
              ? "shown by press"
              : why === "scroll"
                ? "re-veiled, scrolled away"
                : "hidden by press",
          )
        }
        scrollRef={(node) => {
          scroller.current = node;
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => scroller.current?.scrollTo({ top: 9999 })}
          className={chip}
        >
          Scroll to the newest
        </button>
        <button
          type="button"
          onClick={() => setShown([])}
          disabled={shown.length === 0}
          className={chip}
        >
          Hide it again
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{cause === "" ? "1 hidden" : cause}</span>
        {` · ${hiddenCount} ${hiddenCount === 1 ? "veil" : "veils"} up`}
      </p>
    </div>
  );
}
