"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSwapModels,
  defaultSwapQuality,
  defaultSwapTasks,
  defaultSwapUsage,
  projectSwap,
  SwapSavings,
  type SwapMix,
} from "@/registry/ui/swap-savings";

export const tweaks = defineTweaks({
  ghostStyle: {
    kind: "choice",
    label: "Ghosts",
    default: "dashed",
    options: ["dashed", "shade", "cap"],
    names: { dashed: "Dashed", shade: "Shade", cap: "Cap" },
  },
  barWidth: {
    kind: "range",
    label: "Bars",
    default: 32,
    min: 16,
    max: 56,
    step: 4,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const money = (n: number) =>
  `$${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const START: SwapMix = { summaries: 0.4 };

/**
 * Coldbrook's support assistant in October, most of it on Waylight Pro. In
 * the gallery the summaries share eases to 60% once the card is seen, so
 * the bills re-form against today's ghosts.
 */
export function SwapSavingsDemo({
  chrome = true,
  // The chart is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [mix, setMix] = React.useState<SwapMix>(chrome ? START : {});
  const [applied, setApplied] = React.useState<string | null>(null);
  const [compared, setCompared] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);

  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          setMix({ summaries: 0.6 });
        }, 1000);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  const panel = (
    <SwapSavings
      mix={mix}
      onMixChange={setMix}
      onApplyMix={(m) =>
        setApplied(
          Object.entries(m)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
            .join(", "),
        )
      }
      onReset={() => setApplied(null)}
      onCompare={() => setCompared(true)}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-3xl">
        {panel}
      </div>
    );
  }

  const p = projectSwap(
    defaultSwapModels,
    defaultSwapTasks,
    defaultSwapUsage,
    defaultSwapQuality,
    mix,
    "pro",
    "lite",
  );
  const changes = Object.values(mix).filter((v) => v > 0).length;

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{`save ${money(p.savings)}`}</span>
        {p.qualityBefore !== null && p.qualityAfter !== null
          ? ` · quality ${Math.round(p.qualityBefore)} → ${Math.round(p.qualityAfter)}`
          : " · today’s mix"}
        {` · ${changes} ${changes === 1 ? "change" : "changes"} · applied ${applied ?? "none"}`}
        {compared ? " · compared" : ""}
      </p>
    </div>
  );
}
