"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSketchStrokes,
  ScribblePrompt,
} from "@/registry/ui/scribble-prompt";

export const tweaks = defineTweaks({
  penWidth: {
    kind: "range",
    label: "Pen",
    default: 2.5,
    min: 1,
    max: 6,
    step: 0.5,
  },
  gridStyle: {
    kind: "choice",
    label: "Paper",
    default: "dots",
    options: ["dots", "lines", "blank"],
    names: { dots: "Dots", lines: "Lines", blank: "Blank" },
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

const plural = (n: number) => `${n} ${n === 1 ? "mark" : "marks"}`;

/**
 * Fernworks studio is rearranging the Lisbon office floor. The pad opens on a
 * rough sketch of it; the gallery card closes the pad once it is seen, so
 * the drawing docks into the field as a chip.
 */
export function ScribblePromptDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  penWidth = 2.5,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(true);
  const [marks, setMarks] = React.useState(defaultSketchStrokes.length);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.35 });

  // The default sketch is drawn at the chosen pen width too.
  const strokes = React.useMemo(
    () => defaultSketchStrokes.map((s) => ({ ...s, width: penWidth })),
    [penWidth],
  );

  // The gallery card docks the sketch once it has been seen.
  const played = React.useRef(false);
  React.useEffect(() => {
    if (chrome || !inView || played.current) return;
    const t = window.setTimeout(() => {
      played.current = true;
      setOpen(false);
    }, 1600);
    return () => window.clearTimeout(t);
  }, [chrome, inView]);

  const surface = (
    <ScribblePrompt
      key={`${round}-${penWidth}`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setNote(null);
      }}
      defaultStrokes={strokes}
      onStrokesChange={(list) => {
        setMarks(list.length);
        setNote(null);
      }}
      onAttachSketch={(list) =>
        setNote(`sketch attached · ${plural(list.length)}`)
      }
      onSubmit={({ sketch }) =>
        setNote(sketch ? "sent · with sketch" : "sent · words only")
      }
      penWidth={penWidth}
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
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMarks(defaultSketchStrokes.length);
            setNote(null);
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
          {note ??
            (open
              ? `pad open · ${plural(marks)}`
              : marks
                ? `sketch docked · ${plural(marks)}`
                : "no sketch")}
        </span>
        {" · fernworks lisbon floor"}
      </p>
    </div>
  );
}
