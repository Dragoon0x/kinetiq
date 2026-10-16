"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultMendSections,
  defaultMendValues,
  findMendProblems,
  MendList,
  type MendValues,
} from "@/registry/ui/mend-list";

export const tweaks = defineTweaks({
  listStyle: {
    kind: "choice",
    label: "List",
    default: "panel",
    options: ["panel", "chips", "numbered"],
    names: { panel: "Panel", chips: "Chips", numbered: "Numbered" },
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

const FIRST_CHECK = findMendProblems(
  defaultMendSections,
  defaultMendValues,
).map((p) => p.id);

const labelOf = (id: string) =>
  defaultMendSections
    .flatMap((s) => s.fields)
    .find((f) => f.id === id)
    ?.label.toLowerCase() ?? id;

/**
 * Ana Ruiz's application for Fernworks Studio's spring residency, half done
 * and with the usual slips, opening already checked so the mend list is
 * there to work through. The first clean submit meets a server error, so the
 * kept answers can be seen; the second goes through.
 */
export function MendListDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [answers, setAnswers] = React.useState<MendValues>(defaultMendValues);
  // The form opens already checked, so the list (and its style tweak) shows
  // from the first frame; fixing a field strikes it, and a submit re-drops it.
  const [listed, setListed] = React.useState<string[]>(FIRST_CHECK);
  const [last, setLast] = React.useState<string | null>(null);
  const sends = React.useRef(0);
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
    setAnswers(defaultMendValues);
    setListed(FIRST_CHECK);
    setLast(null);
    setRound((r) => r + 1);
  };

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      timers.current.push(window.setTimeout(resolve, ms));
    });

  const left = findMendProblems(defaultMendSections, answers)
    .map((p) => p.id)
    .filter((id) => listed.includes(id));

  const form = (
    <MendList
      key={round}
      defaultValues={defaultMendValues}
      checkOnMount
      onValuesChange={setAnswers}
      onFieldChange={(id, _value, next) => {
        if (!listed.includes(id)) return;
        const still = findMendProblems(defaultMendSections, next).some(
          (p) => p.id === id,
        );
        setLast(still ? null : `mended ${labelOf(id)}`);
      }}
      onInvalid={(ids) => {
        setListed(ids);
        setLast(null);
      }}
      onMend={(id) => setLast(`to ${labelOf(id)}`)}
      onSaveDraft={async () => {
        await wait(700);
        setLast("draft saved");
      }}
      onSubmit={async () => {
        setLast("sending");
        await wait(1300);
        sends.current += 1;
        if (sends.current === 1) {
          setLast("server error · answers kept");
          throw new Error("The studio's inbox is full");
        }
        setLast("submitted");
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{form}</div>;

  const answered = defaultMendSections
    .flatMap((s) => s.fields)
    .filter((f) => {
      const v = answers[f.id];
      return typeof v === "boolean" ? v : (v ?? "").trim().length > 0;
    }).length;
  const nextId = left[0];

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
        {last === "submitted" ? (
          <>
            <span className="text-signal">submitted</span> · {answered} answers
          </>
        ) : last === "sending" ||
          last === "draft saved" ||
          last?.startsWith("server") ? (
          <span className="text-signal">{last}</span>
        ) : listed.length === 0 ? (
          <>
            <span className="text-signal">{answered} of 12 answered</span> ·
            submit to check
          </>
        ) : left.length === 0 ? (
          <>
            <span className="text-signal">all mended</span> · submit again
          </>
        ) : last ? (
          <>
            <span className="text-signal">{last}</span> · {left.length} left
          </>
        ) : (
          <>
            <span className="text-signal">{left.length} to mend</span>
            {nextId ? ` · next: ${labelOf(nextId)}` : null}
          </>
        )}
      </p>
    </div>
  );
}
