"use client";

import * as React from "react";

import { Loader, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPinchCards,
  defaultPinchColumns,
  PinchBoard,
  type PinchColumn,
  type PinchLevel,
  type PinchZoomSource,
} from "@/registry/ui/pinch-board";

export const tweaks = defineTweaks({
  zoomLevels: {
    kind: "range",
    label: "Levels",
    default: 3,
    min: 2,
    max: 4,
    step: 1,
  },
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "plain",
    options: ["plain", "edge", "tint"],
    names: { plain: "Plain", edge: "Edge", tint: "Tint" },
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

const LOAD_MS = 1400;

const SOURCE: Record<PinchZoomSource, string> = {
  pinch: "pinch",
  wheel: "ctrl + scroll",
  key: "keys",
  button: "toolbar",
};

type Note =
  | { kind: "board" }
  | { kind: "zoom"; level: PinchLevel; source: PinchZoomSource }
  | { kind: "moved"; card: string; column: string }
  | { kind: "loading" };

const titleOf = (id: string) =>
  defaultPinchColumns.find((c) => c.id === id)?.title ?? id;

/**
 * Waylight's 4.2 release, two weeks from the cut: seventy-two cards across
 * five columns. Zoom out to see where the work has piled up; zoom in on a
 * column to read it.
 */
export function PinchBoardDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [columns, setColumns] =
    React.useState<PinchColumn[]>(defaultPinchColumns);
  const [note, setNote] = React.useState<Note>({ kind: "board" });
  const timer = React.useRef(0);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const surface = (
    <PinchBoard
      key={run}
      columns={columns}
      onZoom={(level, info) =>
        setNote({ kind: "zoom", level, source: info.source })
      }
      onMove={(move) => {
        const card = move.cards.find((c) => c.id === move.cardId);
        setNote({
          kind: "moved",
          card: card?.key ?? move.cardId,
          column: titleOf(move.to.columnId),
        });
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const line =
    note.kind === "zoom" ? (
      <>
        <span className="text-signal">{note.level} level</span> · by{" "}
        {SOURCE[note.source]} · {defaultPinchCards.length} cards
      </>
    ) : note.kind === "moved" ? (
      <>
        <span className="text-signal">moved {note.card}</span> → {note.column}
      </>
    ) : note.kind === "loading" ? (
      <>
        <span className="text-signal">loading review</span> · outlines in the
        level&apos;s shape
      </>
    ) : (
      <>
        <span className="text-signal">{defaultPinchCards.length} cards</span> ·
        pinch, ctrl + scroll or press + and −
      </>
    );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            window.clearTimeout(timer.current);
            setColumns((cols) =>
              cols.map((c) =>
                c.id === "review" ? { ...c, status: "loading" } : c,
              ),
            );
            setNote({ kind: "loading" });
            timer.current = window.setTimeout(() => {
              setColumns(defaultPinchColumns);
              setNote({ kind: "board" });
            }, LOAD_MS);
          }}
          className={button}
        >
          <Loader aria-hidden className="size-3.5" />
          Load Review
        </button>
        <button
          type="button"
          onClick={() => {
            window.clearTimeout(timer.current);
            setColumns(defaultPinchColumns);
            setNote({ kind: "board" });
            setRun((r) => r + 1);
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
        {line}
      </p>
    </div>
  );
}
