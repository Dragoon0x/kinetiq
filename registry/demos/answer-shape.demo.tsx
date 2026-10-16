"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw, Table2 } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AnswerShape,
  defaultAnswerDraft,
  defaultAnswerShapes,
} from "@/registry/ui/answer-shape";

export const tweaks = defineTweaks({
  skeletonStyle: {
    kind: "choice",
    label: "Skeleton",
    default: "solid",
    options: ["solid", "wire", "type"],
    names: { solid: "Solid", wire: "Wire", type: "Type" },
  },
  pickSize: {
    kind: "choice",
    label: "Picks",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Icons", md: "Labels", lg: "Tiles" },
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

/** The gallery card shows the form changing once: bullets, a table, an email, back. */
const TOUR = ["table", "email", "bullets"];

/**
 * Fieldline, the Larch Street job: the site lead asks for today's crew
 * update and picks the form it should come back in.
 */
export function AnswerShapeDemo({
  chrome = true,
  // The composer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [shape, setShape] = React.useState("bullets");
  const [draft, setDraft] = React.useState(defaultAnswerDraft);
  const [lengths, setLengths] = React.useState<Record<string, number>>({});
  const [sent, setSent] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.4 });

  // The card tours the shapes once after it is first seen.
  const [touring, setTouring] = React.useState(0);
  React.useEffect(() => {
    if (chrome || !inView || touring >= TOUR.length) return;
    const t = window.setTimeout(
      () => {
        setShape(TOUR[touring] ?? "bullets");
        setTouring((n) => n + 1);
      },
      touring === 0 ? 900 : 1700,
    );
    return () => window.clearTimeout(t);
  }, [chrome, inView, touring]);

  const current =
    defaultAnswerShapes.find((s) => s.id === shape) ?? defaultAnswerShapes[0];
  const length = current ? (lengths[current.id] ?? current.defaultLength) : 0;

  const surface = (
    <AnswerShape
      key={round}
      shape={shape}
      onShapeChange={(id) => {
        setShape(id);
        setSent(null);
      }}
      onLengthChange={(n, id) => setLengths((m) => ({ ...m, [id]: n }))}
      draft={draft}
      onDraftChange={(d) => {
        setDraft(d);
        if (d) setSent(null);
      }}
      onSubmit={({ shape: s, length: n }) =>
        setSent(
          `sent · ${s.label.toLowerCase()} · ${n} ${n === 1 ? s.unitOne : s.unit}`,
        )
      }
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-2xl flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Fieldline · Larch Street · today’s crew update
      </p>
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setDraft(
              (d) =>
                `${d.replace(/\s*Put it in a table\.$/, "")} Put it in a table.`,
            );
            setSent(null);
          }}
          className={button}
        >
          <Table2 aria-hidden className="size-3.5" />
          Ask for a table
        </button>
        <button
          type="button"
          onClick={() => {
            setShape("bullets");
            setDraft(defaultAnswerDraft);
            setLengths({});
            setSent(null);
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
          {sent ??
            (current
              ? `${current.label.toLowerCase()} · ${length} ${length === 1 ? current.unitOne : current.unit} · ready`
              : "ready")}
        </span>{" "}
        · fieldline crew update
      </p>
    </div>
  );
}
