"use client";

import * as React from "react";

import { ImageDown, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultMarkupAnnotations,
  ScreenshotMarkup,
  type MarkupAnnotation,
  type MarkupStatus,
  type MarkupTool,
} from "@/registry/ui/screenshot-markup";

export const tweaks = defineTweaks({
  strokeWidth: {
    kind: "range",
    label: "Stroke",
    default: 3,
    min: 2,
    max: 6,
    step: 1,
    unit: "px",
  },
  toolPalette: {
    kind: "choice",
    label: "Tools",
    default: "rail",
    options: ["rail", "float", "strip"],
    names: { rail: "Rail", float: "Float", strip: "Strip" },
  },
  accent: {
    kind: "choice",
    label: "Colour",
    default: "var(--danger)",
    options: [
      "var(--danger)",
      "var(--warn)",
      "var(--accent-bright)",
      "var(--success)",
    ],
    names: {
      "var(--danger)": "Red",
      "var(--warn)": "Amber",
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
    },
  },
});

/** A large screenshot arriving in uneven chunks, the way a slow upload does. */
const CHUNKS = [0.08, 0.21, 0.27, 0.46, 0.58, 0.63, 0.81, 0.94, 1];

/**
 * A Basinworks dashboard screenshot on its way into a bug report: the storm
 * spike called out, the low tank boxed, and one contact's email already
 * pixelated. Press R and paint over another to hide it.
 */
export function ScreenshotMarkupDemo({
  chrome = true,
  // The editor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [marks, setMarks] = React.useState<MarkupAnnotation[]>(
    defaultMarkupAnnotations,
  );
  const [tool, setTool] = React.useState<MarkupTool>("arrow");
  const [event, setEvent] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<MarkupStatus>("ready");
  const [progress, setProgress] = React.useState<number | undefined>();
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const after = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const loadLarge = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    setStatus("loading");
    setProgress(0);
    setEvent("loading 4.2 mb");
    CHUNKS.forEach((p, i) => after(260 * (i + 1), () => setProgress(p)));
    after(260 * CHUNKS.length + 300, () => {
      setStatus("ready");
      setProgress(undefined);
      setEvent("screenshot loaded");
    });
  };

  const surface = (
    <ScreenshotMarkup
      key={round}
      status={status}
      progress={progress}
      onToolChange={setTool}
      onChange={(next) => {
        if (next.length > marks.length) {
          const added = next[next.length - 1];
          setEvent(
            added?.kind === "redact"
              ? `redacted ${added.cells.length} cells`
              : `${added?.kind === "text" ? "label" : (added?.kind ?? "mark")} drawn`,
          );
        } else if (next.length < marks.length) setEvent("mark removed");
        else setEvent("mark moved");
        setMarks(next);
      }}
      onUndo={(prev) => {
        setMarks(prev);
        setEvent("undo");
      }}
      onRedo={(next) => {
        setMarks(next);
        setEvent("redo");
      }}
      onExport={(list) =>
        new Promise<void>((resolve) =>
          after(700, () => {
            setEvent(`exported ${list.length} marks`);
            resolve();
          }),
        )
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const redactions = marks.filter((m) => m.kind === "redact").length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current.clear();
            setMarks(defaultMarkupAnnotations);
            setTool("arrow");
            setStatus("ready");
            setProgress(undefined);
            setEvent(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <button type="button" onClick={loadLarge} className={button}>
          <ImageDown aria-hidden className="size-3.5" />
          Load large
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{event ?? tool}</span> · {marks.length}{" "}
        marks · {redactions} {redactions === 1 ? "redaction" : "redactions"}
      </p>
    </div>
  );
}
