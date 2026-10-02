"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultGiftDesigns,
  defaultGiftNow,
  defaultGiftValue,
  GiftBuilder,
  type GiftState,
  type GiftValue,
} from "@/registry/ui/gift-builder";

export const tweaks = defineTweaks({
  flip: {
    kind: "choice",
    label: "Flip",
    default: "turn",
    options: ["turn", "tumble", "none"],
    names: { turn: "Turn", tumble: "Tumble", none: "Side by side" },
  },
  designs: {
    kind: "choice",
    label: "Designs",
    default: "swatches",
    options: ["swatches", "tiles", "swipe"],
    names: { swatches: "Swatches", tiles: "Tiles", swipe: "Swipe" },
  },
  amount: {
    kind: "choice",
    label: "Amount",
    default: "chips",
    options: ["chips", "slider"],
    names: { chips: "Chips", slider: "Slider" },
  },
});

const DAY_MS = 86_400_000;
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const WEEKDAYS = "sun mon tue wed thu fri sat".split(" ");
const sends = (iso: string | null) => {
  if (!iso) return "sends now";
  const d = new Date(`${iso}T00:00:00Z`);
  return `sends ${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const gets = (iso: string | null) => {
  if (!iso) return "today";
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const money = (v: number) =>
  Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
/** The Thursday after "now": the demo's gift is scheduled for it. */
const THURSDAY = new Date((Math.floor(defaultGiftNow / DAY_MS) + 6) * DAY_MS)
  .toISOString()
  .slice(0, 10);

const BUTTON =
  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const START: GiftValue = { ...defaultGiftValue, sendOn: THURSDAY };

/**
 * A Fernworks gift card for Maya from Sam: $50 on the Meadow design, sent
 * next Thursday. Adding it to the bag takes a moment; Fail next declines it.
 */
export function GiftBuilderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [gift, setGift] = React.useState<GiftValue>(START);
  const [state, setState] = React.useState<GiftState>("idle");
  const [writing, setWriting] = React.useState(false);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running) window.clearTimeout(t);
      running.clear();
    };
  }, []);

  const builder = (
    <GiftBuilder
      key={round}
      value={gift}
      onValueChange={(next) => {
        setWriting(next.message !== gift.message);
        setGift(next);
      }}
      state={state}
      onStateChange={setState}
      onSubmit={() =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          setFailNext(false);
          const id = window.setTimeout(() => {
            timers.current.delete(id);
            if (fail) {
              reject(new Error("Waylight Pay declined the card. Try another."));
              return;
            }
            resolve();
          }, 900);
          timers.current.add(id);
        })
      }
      onReset={() => setGift(START)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{builder}</div>;

  const design =
    defaultGiftDesigns.find((d) => d.id === gift.design)?.name.toLowerCase() ??
    gift.design;
  const head =
    state === "pending"
      ? "adding to bag"
      : state === "done"
        ? `added · ${gift.to.trim().toLowerCase() || "they"} gets it ${gets(gift.sendOn)}`
        : state === "error"
          ? "declined · try another card"
          : writing
            ? `writing · ${gift.message.length} of 180`
            : `${money(gift.amount)} · ${design}`;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {builder}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{head}</span> · {sends(gift.sendOn)}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              const next = !failRef.current;
              failRef.current = next;
              setFailNext(next);
            }}
            className={`${BUTTON} aria-pressed:border-danger/50 aria-pressed:text-danger`}
          >
            Fail next
          </button>
          <button
            type="button"
            onClick={() => {
              for (const t of timers.current) window.clearTimeout(t);
              timers.current.clear();
              failRef.current = false;
              setFailNext(false);
              setGift(START);
              setState("idle");
              setWriting(false);
              setRound((r) => r + 1);
            }}
            className={BUTTON}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
