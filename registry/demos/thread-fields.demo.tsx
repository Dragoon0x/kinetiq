"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultThreadQuestions,
  ThreadFields,
  type ThreadValue,
  type ThreadValues,
} from "@/registry/ui/thread-fields";

export const tweaks = defineTweaks({
  threadStyle: {
    kind: "choice",
    label: "Thread",
    default: "elbow",
    options: ["elbow", "curve", "stitch"],
    names: { elbow: "Elbow", curve: "Curve", stitch: "Stitch" },
  },
  indent: {
    kind: "range",
    label: "Indent",
    default: 24,
    min: 12,
    max: 40,
    step: 4,
    unit: "px",
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

const byId = new Map(defaultThreadQuestions.map((q) => [q.id, q]));

/** The workshop is already chosen, so the demo opens on a drawn thread. */
const OPENED: ThreadValues = { booking: "workshop", size: "12" };

/** What an answer reads as on the status line. */
const said = (id: string, value: ThreadValue) => {
  const q = byId.get(id);
  const values = Array.isArray(value) ? value : [value];
  const labels = values.map(
    (v) => q?.options?.find((o) => o.value === v)?.label ?? v,
  );
  return labels.join(", ").toLowerCase() || "cleared";
};

/**
 * A booking request for Coldbrook Studios on Fernworks Row. The workshop is
 * already chosen, so the demo opens on a drawn thread; change the answer to
 * watch it pull back and drop again. The first send meets a full inbox; the
 * second goes through.
 */
export function ThreadFieldsDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [last, setLast] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState<ThreadValues>(OPENED);
  const sends = React.useRef(0);
  const answer = React.useRef("");
  const timers = React.useRef<number[]>([]);
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    sends.current = 0;
    setLast(null);
    setVisible(OPENED);
    setRound((r) => r + 1);
  };

  const form = (
    <ThreadFields
      key={round}
      defaultValues={OPENED}
      onChange={(id, value, now) => {
        setVisible(now);
        answer.current = said(id, value);
        setLast(`${id} · ${answer.current}`);
      }}
      onReveal={(ids) => {
        setLast(
          `${answer.current} · ${ids.length} follow-up${ids.length === 1 ? "" : "s"}`,
        );
      }}
      onSubmit={(answers) =>
        new Promise<void>((resolve, reject) => {
          setLast("sending");
          timers.current.push(
            window.setTimeout(() => {
              sends.current += 1;
              if (sends.current === 1) {
                setLast("inbox full · answers kept");
                reject(new Error("The studio's inbox is full"));
                return;
              }
              setLast(`sent · ${Object.keys(answers).length} answers`);
              resolve();
            }, 1200),
          );
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{form}</div>;

  const count = Object.keys(visible).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {form}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reset}
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
        <span className="text-signal">{last ?? "workshop · 2 follow-ups"}</span>
        {count > 0 && !last?.startsWith("sent") ? ` · ${count} answered` : null}
      </p>
    </div>
  );
}
