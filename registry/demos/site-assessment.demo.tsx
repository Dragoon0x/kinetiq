"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSiteFindings,
  defaultSitePlan,
  SiteAssessment,
  siteCompleteness,
  type SiteChange,
  type SiteFinding,
  type SitePlan,
  type SiteStatus,
} from "@/registry/ui/site-assessment";

export const tweaks = defineTweaks({
  planStyle: {
    kind: "choice",
    label: "Plan",
    default: "line",
    options: ["line", "filled", "blueprint"],
    names: { line: "Line", filled: "Filled", blueprint: "Blueprint" },
  },
  pinStyle: {
    kind: "choice",
    label: "Pins",
    default: "drop",
    options: ["drop", "dot", "tag"],
    names: { drop: "Marker", dot: "Dot", tag: "Tag" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const WORDS: Record<SiteChange["kind"], string> = {
  add: "placed",
  remove: "removed",
  edit: "edited",
  move: "moved",
};

/**
 * A Fieldline surveyor walking Lot 14 on Harrow Lane: three findings pinned
 * on the plot, a cracked lintel among them, with room for more.
 */
export function SiteAssessmentDemo({
  chrome = true,
  // The survey is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [findings, setFindings] =
    React.useState<SiteFinding[]>(defaultSiteFindings);
  const [plan, setPlan] = React.useState<SitePlan | null>(defaultSitePlan);
  const [status, setStatus] = React.useState<SiteStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [last, setLast] = React.useState("waiting for a change");
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setLast(fail ? "load failed" : "loaded");
    }, 900);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <SiteAssessment height={540} {...values} />
      </div>
    );
  }

  const complete = findings.filter((f) => siteCompleteness(f) === 3).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <SiteAssessment
        height={560}
        plan={plan}
        findings={findings}
        onChange={(next, change) => {
          setFindings(next);
          const i = next.findIndex((f) => f.id === change.id);
          setLast(
            change.kind === "remove"
              ? "finding removed"
              : `finding ${i + 1} ${WORDS[change.kind]}`,
          );
        }}
        onSubmit={(all) => setLast(`submitted ${all.length}`)}
        onUploadPlan={() => {
          setPlan(defaultSitePlan);
          setLast("plan uploaded");
        }}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {findings.length} findings · {complete} complete
          </span>{" "}
          · {last}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => {
              setPlan((p) => (p ? null : defaultSitePlan));
              setLast(plan ? "plan removed" : "plan uploaded");
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {plan ? "Remove plan" : "Restore plan"}
          </button>
          <button
            type="button"
            onClick={() => {
              setFindings(defaultSiteFindings);
              setPlan(defaultSitePlan);
              setStatus("ready");
              setLast("reset");
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
