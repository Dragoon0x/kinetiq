"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultQuickFixDiagnostics,
  QuickFix,
  type QuickFixDiagnostic,
} from "@/registry/ui/quick-fix";

export const tweaks = defineTweaks({
  squiggleStyle: {
    kind: "choice",
    label: "Squiggle",
    default: "wave",
    options: ["wave", "dots", "line"],
    names: { wave: "Wave", dots: "Dots", line: "Line" },
  },
  editorTheme: {
    kind: "choice",
    label: "Theme",
    default: "paper",
    options: ["paper", "slate", "mono"],
    names: { paper: "Paper", slate: "Slate", mono: "Mono" },
  },
  fontScale: {
    kind: "range",
    label: "Type size",
    default: 1,
    min: 0.85,
    max: 1.25,
    step: 0.05,
    unit: "×",
  },
});

const count = (list: QuickFixDiagnostic[], s: QuickFixDiagnostic["severity"]) =>
  list.filter((d) => d.severity === s).length;

/**
 * A Gaugeworks module that totals reservoir readings, with five problems in
 * it. Press F8 to walk them and Command or Control with period to fix one.
 */
export function QuickFixDemo({
  chrome = true,
  // The editor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [diags, setDiags] = React.useState<QuickFixDiagnostic[]>(
    defaultQuickFixDiagnostics,
  );
  const [event, setEvent] = React.useState<string | null>(null);

  const surface = (
    <QuickFix
      key={round}
      onDiagnosticsChange={setDiags}
      onApplyFix={(_d, fix) => setEvent(`fixed · ${fix.title}`)}
      onIgnore={(d) => setEvent(`ignored ${d.rule ?? "a problem"}`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const errors = count(diags, "error");
  const warnings = count(diags, "warning");

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setDiags(defaultQuickFixDiagnostics);
            setEvent(null);
            setRound((r) => r + 1);
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
          {event ?? (diags.length === 0 ? "clean file" : "f8 · next problem")}
        </span>{" "}
        · {errors} {errors === 1 ? "error" : "errors"} · {warnings}{" "}
        {warnings === 1 ? "warning" : "warnings"}
      </p>
    </div>
  );
}
