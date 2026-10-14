"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AddOnTray,
  defaultAddOnPlan,
  defaultAddOns,
  defaultAddOnValue,
  formatCents,
  summarizeAddOns,
  type AddOnCycle,
  type AddOnStatus,
  type AddOnValue,
} from "@/registry/ui/add-on-tray";

export const tweaks = defineTweaks({
  invoicePlacement: {
    kind: "choice",
    label: "Invoice",
    default: "side",
    options: ["side", "foot"],
    names: { side: "Side", foot: "Foot" },
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
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Green" },
  },
});

/**
 * Gaugeworks Pay's Team plan with three extra seats, priority support and
 * 250 GB on top: switch add-ons on and off and watch the invoice follow.
 */
export function AddOnTrayDemo({
  chrome = true,
  // The tray is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<AddOnValue>(defaultAddOnValue);
  const [cycle, setCycle] = React.useState<AddOnCycle>("monthly");
  const [status, setStatus] = React.useState<AddOnStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = (fail: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <AddOnTray height={540} {...values} />
      </div>
    );
  }

  const summary = summarizeAddOns({
    plan: defaultAddOnPlan,
    addOns: defaultAddOns,
    value,
    cycle,
  });
  const count = summary.lines.length - 1;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <AddOnTray
        key={round}
        height={540}
        value={value}
        onChange={setValue}
        cycle={cycle}
        onCycleChange={setCycle}
        status={status}
        onRetry={() => {
          setFailNext(false);
          load(false);
        }}
        onCheckout={(s) =>
          setNote(`checked out · ${formatCents(s.dueToday)} today`)
        }
        {...values}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => load(failNext)} className={button}>
          Reload prices
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next load
        </button>
        <button
          type="button"
          aria-disabled={count === 0 || undefined}
          onClick={() => {
            setValue({});
            setNote("add-ons cleared");
          }}
          className={cn(button, "aria-disabled:opacity-50")}
        >
          Clear add-ons
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            setValue(defaultAddOnValue);
            setCycle("monthly");
            setStatus("ready");
            setFailNext(false);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ??
            (status === "loading"
              ? "loading prices"
              : status === "error"
                ? "prices failed"
                : `${count} add-on${count === 1 ? "" : "s"} · ${formatCents(summary.total)}/${cycle === "annual" ? "yr" : "mo"}`)}
        </span>{" "}
        · {formatCents(summary.dueToday)} charged today
      </p>
    </div>
  );
}
