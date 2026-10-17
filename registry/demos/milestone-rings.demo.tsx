"use client";

import * as React from "react";

import { Plus, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultMilestoneProjects,
  MilestoneRings,
  type MilestoneProject,
} from "@/registry/ui/milestone-rings";

export const tweaks = defineTweaks({
  ringSize: {
    kind: "range",
    label: "Ring",
    default: 26,
    min: 20,
    max: 32,
    step: 2,
    unit: "px",
  },
  overdueStyle: {
    kind: "choice",
    label: "Overdue",
    default: "tint",
    options: ["tint", "hatch", "label"],
    names: { tint: "Tint", hatch: "Hatch", label: "Label" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const REACH_AFTER_MS = 1200;
const STEP = 0.12;

/** Adds `by` to a project's next milestone; reaching 1 marks it done. */
const logProgress = (
  list: MilestoneProject[],
  id: string,
  by: number,
): MilestoneProject[] =>
  list.map((p) => {
    if (p.id !== id) return p;
    const i = p.milestones.findIndex((m) => !m.done && m.progress < 1);
    if (i < 0) return p;
    return {
      ...p,
      milestones: p.milestones.map((m, j) => {
        if (j !== i) return m;
        const progress = Math.min(1, Math.round((m.progress + by) * 100) / 100);
        return progress >= 1
          ? { ...m, progress: 1, done: true }
          : { ...m, progress };
      }),
    };
  });

/**
 * Gaugeworks product lines: Gauge Mini is 82% of the way to tooling
 * sign-off, Flow Meter Pro's field trial is four days late, Field
 * Calibrator has reached everything and Bench Logger has nothing set. The
 * gallery card logs the last of Gauge Mini's progress once it is seen, so
 * its ring closes and a flag flies home.
 */
export function MilestoneRingsDemo({
  chrome = true,
  // The sidebar is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [projects, setProjects] = React.useState(defaultMilestoneProjects);
  const [current, setCurrent] = React.useState("gauge-mini");
  const [note, setNote] = React.useState<string | null>(null);
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
          setProjects((list) => logProgress(list, "gauge-mini", 0.18));
        }, REACH_AFTER_MS);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  const frame = (
    <MilestoneRings
      projects={projects}
      current={current}
      onNavigate={setCurrent}
      onOpenMilestone={(_, m) =>
        setNote(m ? `opened ${m.name}` : "nothing to open")
      }
      onReorder={() => setNote("reordered")}
      frameHeight={520}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-2xl">
        {frame}
      </div>
    );
  }

  const project = projects.find((p) => p.id === current);
  const next = project?.milestones.find((m) => !m.done && m.progress < 1);
  const flags =
    project?.milestones.filter((m) => m.done || m.progress >= 1).length ?? 0;

  return (
    <div ref={ref} className="flex w-full max-w-2xl flex-col gap-4">
      {frame}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          // Kept focusable when there is nothing left to log: disabling a
          // focused button drops focus to the page.
          aria-disabled={!next || undefined}
          onClick={() => {
            if (!next) return;
            setProjects((list) => logProgress(list, current, STEP));
            setNote(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <Plus aria-hidden className="size-3.5" />
          Log progress
        </button>
        <button
          type="button"
          onClick={() => {
            setProjects(defaultMilestoneProjects);
            setCurrent("gauge-mini");
            setNote(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
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
          {`${project?.name ?? ""} · ${
            next
              ? `${next.name} ${Math.round(next.progress * 100)}%`
              : (project?.milestones.length ?? 0) > 0
                ? "all reached"
                : "no milestone"
          }`}
        </span>
        {` · ${flags} ${flags === 1 ? "flag" : "flags"}${note ? ` · ${note}` : ""}`}
      </p>
    </div>
  );
}
