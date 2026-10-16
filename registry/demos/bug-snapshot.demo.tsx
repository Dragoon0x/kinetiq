"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { BugSnapshot } from "@/registry/ui/bug-snapshot";

export const tweaks = defineTweaks({
  captureStyle: {
    kind: "choice",
    label: "Capture",
    default: "flash",
    options: ["flash", "shutter", "lift"],
    names: { flash: "Flash", shutter: "Shutter", lift: "Lift" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  highlightColor: {
    kind: "choice",
    label: "Highlight",
    default: "var(--warn)",
    options: [
      "var(--warn)",
      "var(--danger)",
      "var(--accent-bright)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--warn)": "Amber",
      "var(--danger)": "Coral",
      "var(--accent-bright)": "Cobalt",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

type Phase =
  | { kind: "page" }
  | { kind: "capturing" }
  | { kind: "draft" }
  | { kind: "uploading"; pct: number }
  | { kind: "sent"; reference: string }
  | { kind: "failed" };

/**
 * Basinworks' usage report prints its last monthly figure over the chart's
 * legend. The visitor reports it from the page: the capture lands in the
 * form, the signed-in address already hidden. The upload reports progress
 * in steps; "Fail next upload" makes the next one fail so the kept draft can
 * be seen.
 */
export function BugSnapshotDemo({
  chrome = true,
  // The report is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>({ kind: "page" });
  const [severity, setSeverity] = React.useState("medium");
  const [hidden, setHidden] = React.useState(0);
  const [failNext, setFailNext] = React.useState(false);
  const failRef = React.useRef(failNext);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    failRef.current = failNext;
  }, [failNext]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const later = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    setPhase({ kind: "page" });
    setSeverity("medium");
    setHidden(0);
    setRound((r) => r + 1);
  };

  const surface = (
    <BugSnapshot
      key={round}
      onOpenChange={(open) =>
        setPhase(open ? { kind: "capturing" } : { kind: "page" })
      }
      onCapture={() => setPhase({ kind: "draft" })}
      onRedact={(list) => setHidden(list.length)}
      onDraftChange={(draft) => setSeverity(draft.severity)}
      onSubmit={(_report, progress) =>
        new Promise<string>((resolve, reject) => {
          const fail = failRef.current;
          setFailNext(false);
          setPhase({ kind: "uploading", pct: 0 });
          const steps = [0.18, 0.41, 0.64, 0.86];
          steps.forEach((f, i) => {
            if (fail && i > 2) return;
            later(320 * (i + 1), () => {
              progress(f);
              setPhase({ kind: "uploading", pct: Math.round(f * 100) });
            });
          });
          later(fail ? 1150 : 1600, () => {
            if (fail) {
              setPhase({ kind: "failed" });
              reject(new Error("upload failed"));
            } else {
              setPhase({ kind: "sent", reference: "BS-2047" });
              resolve("BS-2047");
            }
          });
        })
      }
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
    phase.kind === "page"
      ? "page · usage report"
      : phase.kind === "capturing"
        ? "capturing the page"
        : phase.kind === "draft"
          ? `draft · ${severity} · ${hidden} hidden`
          : phase.kind === "uploading"
            ? `uploading ${phase.pct}%`
            : phase.kind === "sent"
              ? `sent · ${phase.reference}`
              : "upload failed · draft kept";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={cn(
            button,
            failNext && "border-danger/40 text-danger hover:text-danger",
          )}
        >
          Fail next upload
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
