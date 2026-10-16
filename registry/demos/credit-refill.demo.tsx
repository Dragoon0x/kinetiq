"use client";

import * as React from "react";

import { Clapperboard, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CreditRefill,
  defaultCreditRefillPacks,
} from "@/registry/ui/credit-refill";

export const tweaks = defineTweaks({
  gaugeStyle: {
    kind: "choice",
    label: "Gauge",
    default: "vial",
    options: ["vial", "orb", "bar"],
    names: { vial: "Vial", orb: "Orb", bar: "Bar" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "mint", "amber", "ink"],
    names: { cobalt: "Cobalt", mint: "Mint", amber: "Amber", ink: "Ink" },
  },
});

const START = 312;
const RATE = 144;
const CHARGE_MS = 700;
/** A fixed afternoon, so the runway's clock reads the same everywhere. */
const NOW = Date.UTC(2026, 9, 14, 14, 30);

const JOBS = [
  { name: "Atrium walkthrough", spec: "4K · 1,440 frames", done: 62 },
  { name: "Lobby stills", spec: "12 views · 8K", done: 0 },
  { name: "Facade turntable", spec: "1080p · 360 frames", done: 0 },
];

const grouping = new Intl.NumberFormat("en-US");

/** The work the sheet interrupts: a Fernworks render queue mid-job. */
function RenderQueue() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2"
        >
          <Clapperboard className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-[13px] font-semibold text-foreground">
            Render queue
          </p>
          <p className="truncate text-[11px] text-ink-3">
            Fernworks Studio · 3 jobs
          </p>
        </div>
      </div>
      <ul role="list" className="flex flex-col gap-2">
        {JOBS.map((job) => (
          <li
            key={job.name}
            className="flex flex-col gap-1.5 rounded-3 border border-hairline bg-card px-3 py-2.5"
          >
            <span className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="truncate font-medium text-foreground">
                {job.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                {job.done ? `${job.done}%` : "Queued"}
              </span>
            </span>
            <span className="text-[11px] text-ink-3">{job.spec}</span>
            <span className="h-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-cobalt-bright"
                style={{ width: `${job.done}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A Fernworks render studio with 312 credits left, burning 144 an hour. The
 * sheet docks over the queue; "Fail next payment" makes the next charge come
 * back declined so the reason has somewhere to show.
 */
export function CreditRefillDemo({
  chrome = true,
  // The sheet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [balance, setBalance] = React.useState(START);
  const [pack, setPack] = React.useState("pack-2000");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    failRef.current = false;
    setFailNext(false);
    setBalance(START);
    setPack("pack-2000");
    setNote(null);
    setRound((r) => r + 1);
  };

  const chosen = defaultCreditRefillPacks.find((p) => p.id === pack);
  const after = balance + (chosen ? chosen.credits + (chosen.bonus ?? 0) : 0);

  const surface = (
    <CreditRefill
      key={round}
      balance={balance}
      rate={RATE}
      now={NOW}
      value={pack}
      onValueChange={(id) => {
        setPack(id);
        setNote(null);
      }}
      onAutoRechargeChange={(on, below) =>
        setNote(
          on ? `auto-recharge below ${grouping.format(below)}` : "auto off",
        )
      }
      onThresholdChange={(below) =>
        setNote(`auto-recharge below ${grouping.format(below)}`)
      }
      onBuy={(p) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          if (fail) setFailNext(false);
          timers.current.push(
            window.setTimeout(() => {
              if (fail) {
                setNote("payment declined · pack kept");
                reject(new Error("The card was declined: insufficient funds."));
                return;
              }
              const added = p.credits + (p.bonus ?? 0);
              setBalance((b) => b + added);
              setNote(`bought ${grouping.format(p.credits)}`);
              resolve();
            }, CHARGE_MS),
          );
        })
      }
      onDismiss={() => setNote("sheet dismissed · queue running")}
      onOpenChange={(open) => {
        if (open) setNote(null);
      }}
      {...values}
    >
      <RenderQueue />
    </CreditRefill>
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => {
            failRef.current = !failNext;
            setFailNext((v) => !v);
          }}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next payment
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <>
            <span className="text-signal">{note}</span> ·{" "}
            {grouping.format(balance)} credits
          </>
        ) : (
          <>
            <span className="text-signal">
              {grouping.format(balance)} credits
            </span>{" "}
            · {grouping.format(after)} after the pack
          </>
        )}
      </p>
    </div>
  );
}
