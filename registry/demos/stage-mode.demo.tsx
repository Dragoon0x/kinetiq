"use client";

import * as React from "react";

import { Presentation, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultStageBoards,
  StageMode,
  type StageModeValue,
} from "@/registry/ui/stage-mode";

export const tweaks = defineTweaks({
  cascade: {
    kind: "range",
    label: "Cascade",
    default: 60,
    min: 0,
    max: 160,
    step: 20,
    unit: "ms",
  },
  peekZone: {
    kind: "range",
    label: "Peek zone",
    default: 24,
    min: 8,
    max: 48,
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

const BUTTON = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
  "hover:bg-surface-2 hover:text-foreground",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
);

/**
 * Waylight’s Q4 launch review: four boards, their comment pins and the
 * people reviewing them. Present takes the stage; an edge peeks the chrome.
 */
export function StageModeDemo({
  chrome = true,
  // The review is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [mode, setMode] = React.useState<StageModeValue>("normal");
  const [page, setPage] = React.useState(defaultStageBoards[0]?.id ?? "");
  const [tool, setTool] = React.useState("select");
  const board = defaultStageBoards.find((b) => b.id === page);

  const surface = (
    <StageMode
      key={round}
      mode={mode}
      onModeChange={setMode}
      page={page}
      onNavigate={setPage}
      onAction={setTool}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={mode === "stage"}
          onClick={() => setMode((m) => (m === "stage" ? "normal" : "stage"))}
          className={BUTTON}
        >
          <Presentation aria-hidden className="size-3.5" />
          {mode === "stage" ? "Leave stage" : "Take the stage"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("normal");
            setPage(defaultStageBoards[0]?.id ?? "");
            setTool("select");
            setRound((r) => r + 1);
          }}
          className={BUTTON}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{mode}</span>
        {` · ${board?.label.toLowerCase() ?? "board"} · ${board?.comments ?? 0} comments · ${tool}`}
      </p>
    </div>
  );
}
