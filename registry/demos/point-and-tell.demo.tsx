"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PointAndTell } from "@/registry/ui/point-and-tell";

export const tweaks = defineTweaks({
  outlineStyle: {
    kind: "choice",
    label: "Outline",
    default: "measure",
    options: ["measure", "dashed", "corners"],
    names: { measure: "Measure", dashed: "Dashed", corners: "Corners" },
  },
  maskStyle: {
    kind: "choice",
    label: "Mask",
    default: "blur",
    options: ["blur", "bars", "dots"],
    names: { blur: "Blur", bars: "Bars", dots: "Dots" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "oklch(from var(--accent-bright) l c 320)",
      "oklch(from var(--warn) 0.62 0.15 h)",
      "oklch(from var(--success) 0.55 0.14 h)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
      "oklch(from var(--warn) 0.62 0.15 h)": "Amber",
      "oklch(from var(--success) 0.55 0.14 h)": "Moss",
    },
  },
});

/**
 * Fieldline's equipment checkout: a field tech points at the part of the
 * form that confused them — the borrower's address is masked in the crop —
 * and sends a note. "Fail next send" makes the next send fail, so the kept
 * note and pins can be seen.
 */
export function PointAndTellDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [pointing, setPointing] = React.useState(false);
  const [pins, setPins] = React.useState<string[]>([]);
  const [line, setLine] = React.useState("point mode off");
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

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    setPointing(false);
    setPins([]);
    setLine("point mode off");
    setRound((r) => r + 1);
  };

  const surface = (
    <PointAndTell
      key={round}
      pointing={pointing}
      onPointingChange={(on) => {
        setPointing(on);
        setLine(on ? "pointing" : `point mode off · ${pins.length} pinned`);
      }}
      pins={pins}
      onPinsChange={(next) => {
        setPins(next);
        setLine(`${next.length} pinned`);
      }}
      onPoint={(target) => setLine(`pinned · ${target.label.toLowerCase()}`)}
      onCancel={() => setLine("cancelled · cleared")}
      onSubmit={(feedback) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          setFailNext(false);
          setLine("sending");
          const t = window.setTimeout(() => {
            timers.current.delete(t);
            if (fail) {
              setLine("send failed · note and pins kept");
              reject(new Error("send failed"));
            } else {
              setLine(
                `sent · ${feedback.targets.length} area${feedback.targets.length === 1 ? "" : "s"}`,
              );
              resolve();
            }
          }, 1200);
          timers.current.add(t);
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
          Fail next send
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
