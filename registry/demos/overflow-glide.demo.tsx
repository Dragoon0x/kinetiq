"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  OverflowGlide,
  type OverflowGlidePhase,
} from "@/registry/ui/overflow-glide";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 3,
    min: 1,
    max: 6,
    step: 0.5,
    unit: "wps",
  },
  pause: {
    kind: "range",
    label: "Pause",
    default: 0.8,
    min: 0,
    max: 2,
    step: 0.1,
    unit: "s",
  },
  fade: { kind: "toggle", label: "Fade", default: true },
  loop: { kind: "toggle", label: "Loop", default: false },
});

const FILES = [
  {
    name: "Coldbrook weir survey — spring flow at the upper and lower gauges, final.pdf",
    meta: "PDF · 2.4 MB · Sep 12",
  },
  { name: "Site map.png", meta: "PNG · 812 KB · Sep 10" },
  {
    name: "Basin sediment cores 14 to 22 — grain counts and lab notes.xlsx",
    meta: "Sheet · 1.1 MB · Sep 9",
  },
  {
    name: "Ridge transect, east slope: lichen and moss cover by quadrant.csv",
    meta: "CSV · 96 KB · Sep 8",
  },
  { name: "Field crew roster.docx", meta: "Doc · 40 KB · Sep 5" },
  {
    name: "Night recordings from the north marsh, hydrophone two, week two.wav",
    meta: "Audio · 88 MB · Sep 3",
  },
  {
    name: "Waylight grant report draft — methods, results and what we still owe.docx",
    meta: "Doc · 310 KB · Aug 29",
  },
] as const;

type Status =
  | { kind: "idle" }
  | { kind: "phase"; phase: Exclude<OverflowGlidePhase, "rest">; index: number }
  | { kind: "opened"; index: number };

function FileGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-ink-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinejoin="round"
    >
      <path d="M4 1.75h5.25L12.5 5v9.25H4z" />
      <path d="M9 1.75V5.25h3.5" />
    </svg>
  );
}

const wordsPer = (n: number) => `${n} ${n === 1 ? "word" : "words"} a second`;

/**
 * The Field reports folder on the Fernworks shared drive: long file names cut
 * to their rows, each row a real button. Point at a row (or tab to it) and its
 * name glides to show the rest; on a phone the first tap reads, the second
 * opens.
 */
export function OverflowGlideDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const speed = values.speed ?? tweaks.speed.default;
  const total = FILES.length;

  const onPhase = (index: number, phase: OverflowGlidePhase) =>
    setStatus((prev) => {
      if (phase !== "rest") return { kind: "phase", phase, index };
      return prev.kind === "phase" && prev.index === index
        ? { kind: "idle" }
        : prev;
    });

  const line =
    status.kind === "idle"
      ? [`${total} files`, "point at a name to read the rest"]
      : status.kind === "opened"
        ? [`opened file ${status.index + 1} of ${total}`, ""]
        : status.phase === "reading"
          ? [`reading file ${status.index + 1} of ${total}`, wordsPer(speed)]
          : status.phase === "holding"
            ? ["end of the name", `file ${status.index + 1} of ${total}`]
            : ["easing home", `file ${status.index + 1} of ${total}`];

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <div className="overflow-clip rounded-3 border border-hairline bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Field reports</p>
            <p className="text-xs text-ink-3">Fernworks shared drive</p>
          </div>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
            {`${total} files`}
          </span>
        </div>
        <ul className="flex flex-col gap-1 p-1.5">
          {FILES.map((file, index) => (
            <li key={file.name}>
              <button
                type="button"
                onClick={() => setStatus({ kind: "opened", index })}
                className="flex w-full items-center gap-3 rounded-2 px-2.5 py-2 text-left transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <FileGlyph />
                <span className="flex min-w-0 flex-1 flex-col">
                  <OverflowGlide
                    className="text-sm text-foreground"
                    sound={sound}
                    onPhaseChange={(phase) => onPhase(index, phase)}
                    {...values}
                  >
                    {file.name}
                  </OverflowGlide>
                  <span className="text-xs text-ink-3">{file.meta}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line[0]}</span>
          {line[1] ? ` · ${line[1]}` : null}
        </p>
      ) : null}
    </div>
  );
}
