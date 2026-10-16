"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultQuickCaptureNow,
  defaultQuickCaptureProjects,
  QuickCapture,
  type QuickCaptureTask,
} from "@/registry/ui/quick-capture";

export const tweaks = defineTweaks({
  tokenStyle: {
    kind: "choice",
    label: "Tokens",
    default: "pill",
    options: ["pill", "tag", "plain"],
    names: { pill: "Pill", tag: "Tag", plain: "Plain" },
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

const d = new Date(defaultQuickCaptureNow);
const TOMORROW = Date.UTC(
  d.getUTCFullYear(),
  d.getUTCMonth(),
  d.getUTCDate() + 1,
);

/** Half-typed when the card first shows: the weir needs a look after rain. */
const DRAFT: Partial<QuickCaptureTask> = {
  title: "Check the weir gauge after the rain",
  project: "weir",
  due: TOMORROW,
};

const where = (task: QuickCaptureTask) =>
  defaultQuickCaptureProjects.find((p) => p.id === task.project)?.name ??
  (task.assignee === "noor" ? "My tasks" : "Inbox");

/**
 * Noor Haddad capturing tasks for Fernworks between site calls. A title with
 * "fail" in it is refused, so the draft has a reason to fly home.
 */
export function QuickCaptureDemo({
  chrome = true,
  // The dialog is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [last, setLast] = React.useState<string | null>(null);
  const [made, setMade] = React.useState(0);
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const reset = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setLast(null);
    setMade(0);
    setRound((r) => r + 1);
  };

  const surface = (
    <QuickCapture
      key={round}
      defaultDraft={DRAFT}
      onCreate={async (task) => {
        setLast(`creating · ${task.title}`);
        await new Promise((r) => window.setTimeout(r, 520));
        if (/fail/i.test(task.title)) {
          setLast("create failed · draft returned");
          throw new Error("Fernworks did not answer. Your task is still here.");
        }
        setMade((m) => m + 1);
        setLast(`created · ${task.title} → ${where(task)}`);
      }}
      onDiscard={() => setLast("discarded")}
      onOpenChange={(open) => {
        if (timer.current) window.clearTimeout(timer.current);
        if (!open && !chrome) timer.current = window.setTimeout(reset, 3200);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            <span className="text-signal">{last}</span> · {made} made
          </>
        ) : (
          <>
            <span className="text-signal">draft · weir survey</span> · enter
            creates, ⌘ enter keeps going
          </>
        )}
      </p>
    </div>
  );
}
