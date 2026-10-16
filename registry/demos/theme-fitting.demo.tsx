"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultThemeFittingThemes,
  defaultThemeFittingValue,
  ThemeFitting,
  type ThemeFittingValue,
} from "@/registry/ui/theme-fitting";

export const tweaks = defineTweaks({
  previewScale: {
    kind: "range",
    label: "Preview",
    default: 1,
    min: 0.8,
    max: 1.2,
    step: 0.05,
    unit: "×",
  },
  swatchShape: {
    kind: "choice",
    label: "Swatch",
    default: "circle",
    options: ["circle", "square", "chip"],
    names: { circle: "Circle", square: "Square", chip: "Chip" },
  },
  revealSpeed: {
    kind: "range",
    label: "Sweep",
    default: 640,
    min: 300,
    max: 1200,
    step: 50,
    unit: "ms",
  },
});

const SAVE_MS = 700;
const nameOf = (id: string) =>
  id === "auto"
    ? "auto"
    : (
        defaultThemeFittingThemes.find((t) => t.id === id)?.name ?? id
      ).toLowerCase();

/**
 * Coldbrook's settings, Appearance: the café's manager is trying Night before
 * the evening shift. Saving is faked with a short wait; "Fail next save"
 * refuses one so the kept choice can be seen.
 */
export function ThemeFittingDemo({
  chrome = true,
  // The panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [value, setValue] = React.useState<ThemeFittingValue>(
    defaultThemeFittingValue,
  );
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const failRef = React.useRef(failNext);
  React.useEffect(() => {
    failRef.current = failNext;
  });
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const panel = (
    <ThemeFitting
      key={round}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        setNote(null);
      }}
      onSave={(v) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          if (fail) setFailNext(false);
          timers.current.push(
            window.setTimeout(() => {
              if (fail) {
                setNote(`save failed · ${nameOf(v.theme)} kept`);
                reject(new Error("refused"));
              } else {
                setNote(`saved ${nameOf(v.theme)}`);
                resolve();
              }
            }, SAVE_MS),
          );
        })
      }
      onRevert={() => setNote("reverted to saved")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{panel}</div>;

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setValue(defaultThemeFittingValue);
    setFailNext(false);
    setNote(null);
    setRound((r) => r + 1);
  };
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {panel}
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
          Fail next save
        </button>
        <button type="button" onClick={reset} className={button}>
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
        ) : (
          <>
            <span className="text-signal">
              {nameOf(value.theme)} · {value.density} · {value.accent}
            </span>{" "}
            · trying on
          </>
        )}
      </p>
    </div>
  );
}
