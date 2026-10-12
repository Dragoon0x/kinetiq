"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countHelpDone,
  defaultHelpFields,
  defaultHelpValues,
  MarginHelp,
  type HelpStatus,
  type HelpValues,
} from "@/registry/ui/margin-help";

export const tweaks = defineTweaks({
  side: {
    kind: "choice",
    label: "Margin",
    default: "right",
    options: ["right", "left"],
    names: { right: "Right", left: "Left" },
  },
  cardStyle: {
    kind: "choice",
    label: "Help",
    default: "card",
    options: ["card", "note", "plain"],
    names: { card: "Card", note: "Note", plain: "Plain" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Basinworks' individual tax return: the reference and date of birth are
 * already on file; focus a field and its help slides into the margin.
 */
export function MarginHelpDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<HelpValues>(defaultHelpValues);
  const [status, setStatus] = React.useState<HelpStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [last, setLast] = React.useState("ready");
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <MarginHelp height={540} {...values} />
      </div>
    );
  }

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setLast("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setLast(fail ? "load failed" : "loaded");
    }, 900);
  };

  const done = countHelpDone(defaultHelpFields, value);
  const total = defaultHelpFields.length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <MarginHelp
        height={540}
        value={value}
        status={status}
        onRetry={load}
        onChange={(next, change) => {
          setValue(next);
          const field = defaultHelpFields.find((f) => f.id === change.fieldId);
          setLast(
            change.source === "example"
              ? `example used in ${field?.label ?? change.fieldId}`
              : `typed in ${field?.label ?? change.fieldId}`,
          );
        }}
        onSubmit={() => setLast("sent")}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {done} of {total} fields
          </span>{" "}
          · {last}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger aria-pressed:text-danger"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(defaultHelpValues);
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
