"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultThemeAccents,
  defaultThemeDraft,
  ThemeFitting,
  type ThemeDraft,
  type ThemeStatus,
} from "@/registry/ui/theme-fitting";

export const tweaks = defineTweaks({
  screen: {
    kind: "choice",
    label: "Screen",
    default: "table",
    options: ["table", "inbox", "editor"],
    names: { table: "Orders", inbox: "Inbox", editor: "Editor" },
  },
  compare: {
    kind: "toggle",
    label: "Compare",
    default: false,
  },
  density: {
    kind: "choice",
    label: "Controls",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const accentName = (id: string) =>
  defaultThemeAccents.find((a) => a.id === id)?.label.toLowerCase() ?? id;

/**
 * Coldbrook's appearance settings: try a teal accent and rounder corners on
 * the orders screen, wear it on the controls, keep it or put it back.
 */
export function ThemeFittingDemo({
  chrome = true,
  // The fitting room is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  compare: compareTweak = false,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [draft, setDraft] = React.useState<ThemeDraft>(defaultThemeDraft);
  const [kept, setKept] = React.useState(0);
  const [status, setStatus] = React.useState<ThemeStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [generation, setGeneration] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  // The stage's Compare tweak seeds the switch; the surface's own switch
  // still works between tweaks.
  const [compare, setCompare] = React.useState(compareTweak);
  const [seenCompare, setSeenCompare] = React.useState(compareTweak);
  if (seenCompare !== compareTweak) {
    setSeenCompare(compareTweak);
    setCompare(compareTweak);
  }

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(failNext ? "error" : "ready");
      setFailNext(false);
    }, 900);
  };

  const surface = (
    <ThemeFitting
      key={generation}
      height={chrome ? 520 : 540}
      value={draft}
      onChange={setDraft}
      onCommit={() => setKept((n) => n + 1)}
      compare={compare}
      onCompareChange={setCompare}
      status={status}
      onRetry={load}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setDraft(defaultThemeDraft);
    setKept(0);
    setStatus("ready");
    setFailNext(false);
    setCompare(compareTweak);
    setGeneration((g) => g + 1);
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {accentName(draft.accent)} · {draft.radius}px · {draft.density} ·{" "}
            {draft.scheme}
          </span>{" "}
          · kept {kept} {kept === 1 ? "time" : "times"}
          {status !== "ready" ? ` · ${status}` : ""}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((v) => !v)}
            className="inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger aria-pressed:text-danger"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reset}
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
