"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ConjureButton,
  type ConjureStatus,
} from "@/registry/ui/conjure-button";

export const tweaks = defineTweaks({
  particles: {
    kind: "range",
    label: "Particles",
    default: 24,
    min: 12,
    max: 48,
    step: 4,
  },
  orbit: {
    kind: "range",
    label: "Orbit",
    default: 0.4,
    min: 0.1,
    max: 1,
    step: 0.05,
    unit: "rev/s",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "aurora",
    options: ["aurora", "mono", "ember"],
    names: { aurora: "Aurora", mono: "Mono", ember: "Ember" },
  },
  shimmer: { kind: "toggle", label: "Shimmer", default: true },
});

/**
 * The host's side of the story, scripted: each press starts the next run,
 * and each run lands where the script says after as long as it says. The
 * button only ever shows what this host tells it.
 */
const SCRIPT: readonly { ms: number; items: number | null }[] = [
  { ms: 2200, items: 6 },
  { ms: 1700, items: null },
  { ms: 2600, items: 5 },
  { ms: 1900, items: 7 },
];

/**
 * Fieldline's changelog: draft the notes for release 2.14 from its merged
 * changes. The draft takes a moment, and sometimes fails.
 */
export function ConjureButtonDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<ConjureStatus>("idle");
  const [run, setRun] = React.useState(0);
  const [items, setItems] = React.useState(6);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const step = SCRIPT[(Math.max(1, run) - 1) % SCRIPT.length] ?? SCRIPT[0];

  const draft = () => {
    const next = SCRIPT[run % SCRIPT.length] ?? { ms: 2000, items: 6 };
    setRun(run + 1);
    setStatus("working");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (next.items === null) {
        setStatus("error");
      } else {
        setItems(next.items);
        setStatus("done");
      }
    }, next.ms);
  };

  const line =
    status === "working"
      ? [
          "drafting",
          ` · run ${run} · ${((step?.ms ?? 2000) / 1000).toFixed(1)} s`,
        ]
      : status === "done"
        ? ["notes drafted", ` · ${items} items · press to redraft`]
        : status === "error"
          ? ["draft failed", " · press to retry"]
          : ["ready", " · 14 changes · press to draft"];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3 border border-hairline bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Release 2.14</p>
          <p className="text-xs text-ink-3">14 merged changes since 2.13</p>
        </div>
        <ConjureButton
          label="Draft release notes"
          workingLabel="Drafting release notes"
          doneLabel={`Notes drafted · ${items} items`}
          errorLabel="Draft failed · Retry"
          status={status}
          onConjure={draft}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line[0]}</span>
          {line[1]}
        </p>
      ) : null}
    </div>
  );
}
