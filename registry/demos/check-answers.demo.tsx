"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CheckAnswers,
  defaultCheckAnswersSections,
  defaultCheckAnswersValues,
} from "@/registry/ui/check-answers";

export const tweaks = defineTweaks({
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  dividerStyle: {
    kind: "choice",
    label: "Dividers",
    default: "rule",
    options: ["rule", "dotted", "zebra"],
    names: { rule: "Rule", dotted: "Dotted", zebra: "Zebra" },
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

const rows = defaultCheckAnswersSections.flatMap((s) => s.rows);
const labelOf = (id: string) =>
  rows.find((r) => r.id === id)?.label.toLowerCase() ?? id;

/**
 * Ada Mensah's drainage connection permit for Basinworks, at the review
 * step: the parcel reference and the contractor are still missing. The
 * first send fails partway (the permit service doesn't answer) and keeps
 * every answer; the second goes through.
 */
export function CheckAnswersDemo({
  chrome = true,
  // The review is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [answers, setAnswers] = React.useState(defaultCheckAnswersValues);
  const [event, setEvent] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | undefined>();
  const tries = React.useRef(0);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    tries.current = 0;
    setAnswers(defaultCheckAnswersValues);
    setEvent(null);
    setProgress(undefined);
    setRound((r) => r + 1);
  };

  const send = () =>
    new Promise<void>((resolve, reject) => {
      tries.current += 1;
      const fails = tries.current === 1;
      let p = 0;
      setProgress(0);
      const step = () => {
        p = Math.min(1, p + (fails ? 0.14 : 0.11));
        setProgress(p);
        setEvent(`sending · ${Math.round(p * 100)}%`);
        if (fails && p >= 0.7) {
          later(() => {
            setProgress(undefined);
            setEvent("send failed · nothing lost");
            reject(new Error("The permit service didn't answer."));
          }, 260);
          return;
        }
        if (p >= 1) {
          later(() => {
            setProgress(undefined);
            setEvent("sent · bw-2026-0815");
            resolve();
          }, 200);
          return;
        }
        later(step, 220);
      };
      later(step, 220);
    });

  const surface = (
    <CheckAnswers
      key={round}
      value={answers}
      onChange={setAnswers}
      onEdit={(id) => setEvent(`changing ${labelOf(id)}`)}
      onSave={(id) => setEvent(`saved · ${labelOf(id)}`)}
      onSubmit={send}
      progress={progress}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const answered = rows.filter((r) =>
    r.fields.every((f) => {
      const v = answers[f.id] ?? "";
      if (v.trim() === "") return !f.required;
      return !(f.validate?.(v, answers) ?? null);
    }),
  ).length;
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
        <span className="text-signal">{event ?? "review"}</span> · {answered} of{" "}
        {rows.length} answered
      </p>
    </div>
  );
}
