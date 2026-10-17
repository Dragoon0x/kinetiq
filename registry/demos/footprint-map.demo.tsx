"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultFootprintAgents,
  defaultFootprintEvents,
  FootprintMap,
  type FootprintEvent,
  type FootprintOp,
} from "@/registry/ui/footprint-map";

export const tweaks = defineTweaks({
  trailLength: {
    kind: "range",
    label: "Trail",
    default: 3,
    min: 0,
    max: 8,
    step: 1,
    unit: "files",
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "access",
    options: ["access", "agent", "heat"],
    names: { access: "Access", agent: "Agent", heat: "Heat" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/**
 * What happens next at Fernworks: Reed and Juno meet in CouponField.tsx, Ash
 * finishes the README and goes quiet, and the two of them meet again in the
 * checkout page.
 */
const SCRIPT: [string, string, FootprintOp][] = [
  ["juno", "tests/cart.test.ts", "write"],
  ["ash", "docs/coupons.md", "write"],
  ["reed", "src/app/checkout/actions.ts", "write"],
  ["juno", "src/app/checkout/CouponField.tsx", "read"],
  ["reed", "src/app/checkout/CouponField.tsx", "write"],
  ["ash", "docs/checkout.md", "write"],
  ["juno", "tests/coupons.test.ts", "write"],
  ["reed", "src/lib/coupons.ts", "write"],
  ["ash", "README.md", "write"],
  ["juno", "tests/checkout.test.ts", "write"],
  ["reed", "src/app/checkout/Summary.tsx", "write"],
  ["juno", "src/lib/coupons.ts", "read"],
  ["reed", "src/components/PriceTag.tsx", "read"],
  ["juno", "tests/checkout.test.ts", "write"],
  ["reed", "src/app/checkout/Summary.tsx", "write"],
  ["juno", "tests/cart.test.ts", "read"],
  ["reed", "src/app/checkout/page.tsx", "write"],
  ["juno", "src/app/checkout/page.tsx", "read"],
  ["reed", "src/lib/format.ts", "read"],
  ["juno", "tests/checkout.test.ts", "write"],
];

/** Each step stands for 50 seconds of the afternoon. */
const STEP_MS = 50_000;
const TICK = 1100;
const LAST = defaultFootprintEvents[defaultFootprintEvents.length - 1];
const START_AT = (LAST?.at ?? 0) + 20_000;

const nameOf = (id: string) =>
  defaultFootprintAgents.find((a) => a.id === id)?.name ?? id;
const base = (path: string) => path.slice(path.lastIndexOf("/") + 1);

type Said =
  | { kind: "step"; event: FootprintEvent }
  | { kind: "follow"; id: string | null }
  | { kind: "pause"; paused: boolean }
  | { kind: "open"; path: string; steps: number };

/** Plays the script while the map is on screen and the tab is visible. */
function useOnScreen(node: HTMLElement | null) {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    if (!node) return;
    let inView = false;
    const sync = () => setOn(inView && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false;
      sync();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [node]);
  return on;
}

export function FootprintMapDemo({
  chrome = true,
  // The map is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [step, setStep] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [said, setSaid] = React.useState<Said | null>(null);
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const onScreen = useOnScreen(node);

  const events = React.useMemo(() => {
    const extra = SCRIPT.slice(0, step).map(
      ([agent, path, op], i): FootprintEvent => ({
        id: `fp-s${i + 1}`,
        agent,
        path,
        op,
        at: START_AT + i * STEP_MS,
      }),
    );
    return [...defaultFootprintEvents, ...extra];
  }, [step]);
  const now = START_AT + Math.max(0, step - 1) * STEP_MS + 10_000;

  // One step per tick; the script rests at its end, then starts over.
  React.useEffect(() => {
    if (!onScreen || paused) return;
    const atEnd = step >= SCRIPT.length;
    const id = window.setTimeout(
      () => {
        if (atEnd) {
          setStep(0);
          setRound((r) => r + 1);
          setSaid(null);
        } else {
          const [agent, path, op] = SCRIPT[step] ?? ["", "", "read"];
          setStep(step + 1);
          setSaid({
            kind: "step",
            event: { id: "", agent, path, op, at: 0 },
          });
        }
      },
      atEnd ? TICK * 4 : TICK,
    );
    return () => window.clearTimeout(id);
  }, [onScreen, paused, step]);

  const surface = (
    <FootprintMap
      key={round}
      events={events}
      now={now}
      paused={paused}
      onPause={(next) => {
        setPaused(next);
        setSaid({ kind: "pause", paused: next });
      }}
      onFollowAgent={(id) => setSaid({ kind: "follow", id })}
      onSelectFile={(path, history) =>
        setSaid({ kind: "open", path, steps: history.length })
      }
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={setNode} className="w-full">
        {surface}
      </div>
    );
  }

  const touched = new Set(events.map((e) => e.path)).size;

  return (
    <div ref={setNode} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setStep(0);
            setPaused(false);
            setSaid(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Restart
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {said?.kind === "follow" ? (
          <>
            <span className="text-signal">
              {said.id ? `following ${nameOf(said.id)}` : "following no one"}
            </span>{" "}
            · {touched} files touched
          </>
        ) : said?.kind === "pause" ? (
          <>
            <span className="text-signal">
              {said.paused ? "paused" : "resumed"}
            </span>{" "}
            · {events.length} steps so far
          </>
        ) : said?.kind === "open" ? (
          <>
            <span className="text-signal">opened {base(said.path)}</span> ·{" "}
            {said.steps} {said.steps === 1 ? "step" : "steps"}
          </>
        ) : said?.kind === "step" ? (
          <>
            <span className="text-signal">
              {nameOf(said.event.agent)}{" "}
              {said.event.op === "write" ? "edited" : "read"}{" "}
              {base(said.event.path)}
            </span>{" "}
            · {touched} files touched
          </>
        ) : (
          <>
            <span className="text-signal">3 agents in fernworks/web</span> ·{" "}
            {touched} files touched
          </>
        )}
      </p>
    </div>
  );
}
