"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRevisionNow,
  defaultRevisionVersions,
  RevisionReel,
  type RevisionVersion,
} from "@/registry/ui/revision-reel";

export const tweaks = defineTweaks({
  reelStyle: {
    kind: "choice",
    label: "Reel",
    default: "film",
    options: ["film", "ticks", "beads"],
    names: { film: "Film", ticks: "Ticks", beads: "Beads" },
  },
  previewFit: {
    kind: "choice",
    label: "Preview",
    default: "fit",
    options: ["fit", "fill", "width"],
    names: { fit: "Fit", fill: "Fill", width: "Width" },
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

const MIN = 60_000;

function ago(at: number) {
  const m = Math.max(0, Math.round((defaultRevisionNow - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/**
 * Twelve saves of the Waylight night-market poster, from the first layout to
 * the final type pass. Restores are faked with a short wait; "Fail next
 * restore" makes one refuse so the failed card shows.
 */
export function RevisionReelDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [versions, setVersions] = React.useState<RevisionVersion[]>(
    defaultRevisionVersions,
  );
  const [currentId, setCurrentId] = React.useState(
    defaultRevisionVersions[defaultRevisionVersions.length - 1]?.id ?? "",
  );
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const failRef = React.useRef(failNext);
  React.useEffect(() => {
    failRef.current = failNext;
  });
  const timers = React.useRef<number[]>([]);
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const sorted = [...versions].sort((a, b) => a.at - b.at);
  const at = Math.max(
    0,
    sorted.findIndex((v) => v.id === currentId),
  );
  const current = sorted[at];

  const surface = (
    <RevisionReel
      key={round}
      versions={versions}
      onVersionsChange={setVersions}
      value={currentId}
      onValueChange={(id) => {
        setCurrentId(id);
        setNote(null);
      }}
      onRestore={() =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          timers.current.push(
            window.setTimeout(() => {
              if (fail) {
                setFailNext(false);
                setNote("restore failed · nothing changed");
                reject(new Error("refused"));
              } else {
                setNote(null);
                resolve();
              }
            }, 700),
          );
        })
      }
      onCompare={(older, newer) => {
        const o = sorted.findIndex((v) => v.id === older.id) + 1;
        const n = sorted.findIndex((v) => v.id === newer.id) + 1;
        setNote(`comparing v${o} and v${n}`);
      }}
      onDownload={() => setNote(`downloading v${at + 1}`)}
      now={defaultRevisionNow}
      author="Ines"
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

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
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next restore
        </button>
        <button
          type="button"
          onClick={() => {
            setVersions(defaultRevisionVersions);
            setCurrentId(
              defaultRevisionVersions[defaultRevisionVersions.length - 1]?.id ??
                "",
            );
            setFailNext(false);
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
        {note ? (
          <span className="text-signal">{note}</span>
        ) : current ? (
          <>
            <span className="text-signal">
              v{at + 1} of {sorted.length}
            </span>{" "}
            · {current.author} · {ago(current.at)} · {current.note}
          </>
        ) : null}
      </p>
    </div>
  );
}
