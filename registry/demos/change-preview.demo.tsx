"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  ChangePreview,
  defaultChangePeriod,
  defaultChangePlans,
  quoteChangePreview,
} from "@/registry/ui/change-preview";

export const tweaks = defineTweaks({
  timelineStyle: {
    kind: "choice",
    label: "Timeline",
    default: "track",
    options: ["track", "rail", "days"],
    names: { track: "Track", rail: "Rail", days: "Days" },
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
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const NOW = Date.UTC(2026, 9, 17, 14);
const TAX = 0.08;
const CONFIRM_MS = 700;
const CREDIT_DOWN = {
  credit:
    "Couldn't calculate the credit for unused Team time: the ledger is catching up.",
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

/**
 * Fernworks on Team ($49 a month) on October 17, looking at Business. The
 * preview counts fifteen days left of a thirty-one day period, with 8% tax
 * on what is due today.
 */
export function ChangePreviewDemo({
  chrome = true,
  // The preview is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [current, setCurrent] = React.useState("team");
  const [chosen, setChosen] = React.useState("business");
  const [creditDown, setCreditDown] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const surface = (
    <ChangePreview
      key={round}
      currentPlan={current}
      value={chosen}
      now={NOW}
      taxRate={TAX}
      errors={creditDown ? CREDIT_DOWN : undefined}
      onPreview={(plan) => {
        setChosen(plan.id);
        setNote(null);
      }}
      onCancel={() => {
        setChosen(current);
        setNote(`kept ${current}`);
      }}
      onConfirm={(plan, quote) =>
        new Promise<void>((resolve) => {
          timers.current.push(
            window.setTimeout(() => {
              if (quote.timing === "now") {
                setCurrent(plan.id);
                setNote(`switched to ${plan.name.toLowerCase()}`);
              } else {
                setNote(`${plan.name.toLowerCase()} from nov 1`);
              }
              resolve();
            }, CONFIRM_MS),
          );
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const plan = defaultChangePlans.find((p) => p.id === chosen);
  const quote = plan
    ? quoteChangePreview({
        current: defaultChangePlans.find((p) => p.id === current),
        plan,
        period: defaultChangePeriod,
        now: NOW,
        taxRate: TAX,
      })
    : null;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={creditDown}
          onClick={() => setCreditDown((v) => !v)}
          className={cn(
            button,
            creditDown && "border-warn/50 text-warn hover:text-warn",
          )}
        >
          Credit unavailable
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            setCurrent("team");
            setChosen("business");
            setCreditDown(false);
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
          {note ?? `${plan?.name ?? "—"} · on ${current}`}
        </span>
        {" · "}
        {!quote || quote.kind === "same"
          ? "no change"
          : quote.timing === "period-end"
            ? "from nov 1 · nothing due today"
            : creditDown
              ? "due today pending credit"
              : `due today ${money(quote.dueToday)}`}
      </p>
    </div>
  );
}
