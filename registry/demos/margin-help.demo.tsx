"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultMarginHelpFields,
  defaultMarginHelpValues,
  MarginHelp,
} from "@/registry/ui/margin-help";

export const tweaks = defineTweaks({
  railWidth: {
    kind: "range",
    label: "Rail width",
    default: 240,
    min: 200,
    max: 320,
    step: 20,
    unit: "px",
  },
  cardStyle: {
    kind: "choice",
    label: "Card",
    default: "card",
    options: ["card", "note", "margin"],
    names: { card: "Card", note: "Note", margin: "Margin" },
  },
  springiness: {
    kind: "range",
    label: "Springiness",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const fields = defaultMarginHelpFields;
const required = fields.filter((f) => f.required);

const fine = (values: Record<string, string>) =>
  required.filter((f) => {
    const v = values[f.id] ?? "";
    return v.trim() !== "" && !(f.validate?.(v, values) ?? null);
  }).length;

/**
 * Halden Street Roasters applying for a Coldbrook wholesale account. Two
 * answers are filled in and the tax number is a digit short, so its error
 * shows in the rail once the field has been left. Sending answers after a
 * short wait.
 */
export function MarginHelpDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [answers, setAnswers] = React.useState(defaultMarginHelpValues);
  const [field, setField] = React.useState<string | null>(null);
  const [helpOn, setHelpOn] = React.useState(true);
  const [event, setEvent] = React.useState<string | null>(null);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    setAnswers(defaultMarginHelpValues);
    setField(null);
    setHelpOn(true);
    setEvent(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <MarginHelp
      key={round}
      value={answers}
      onChange={(next) => {
        setAnswers(next);
        setEvent(null);
      }}
      onFieldFocus={setField}
      showHelp={helpOn}
      onShowHelpChange={setHelpOn}
      onHelpLink={(id, link, e) => {
        e.preventDefault();
        setEvent(`opened · ${link.label.toLowerCase()}`);
      }}
      onSubmit={() =>
        new Promise<void>((resolve) => {
          const t = window.setTimeout(() => {
            timers.current.delete(t);
            setEvent("sent");
            resolve();
          }, 900);
          timers.current.add(t);
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const label =
    fields.find((f) => f.id === field)?.label.toLowerCase() ?? "business name";
  const hasHelp = !!fields.find((f) => f.id === (field ?? "business"))?.help;
  const count = `${fine(answers)} of ${required.length} required`;
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
        {event ? (
          <>
            <span className="text-signal">{event}</span> · {count}
          </>
        ) : !helpOn ? (
          <>
            <span className="text-signal">help hidden</span> · {count}
          </>
        ) : (
          <>
            <span className="text-signal">
              {hasHelp ? `help · ${label}` : `${label} · no help`}
            </span>{" "}
            · {count}
          </>
        )}
      </p>
    </div>
  );
}
