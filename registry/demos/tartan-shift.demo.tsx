"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  TartanShift,
  type TartanShiftPalette,
} from "@/registry/ui/tartan-shift";

export const tweaks = defineTweaks({
  sett: {
    kind: "choice",
    label: "Sett",
    default: "bold",
    options: ["fine", "bold"],
    names: { fine: "Fine", bold: "Bold" },
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "highland",
    options: ["highland", "modern", "earth"],
    names: { highland: "Highland", modern: "Modern", earth: "Earth" },
  },
  drift: {
    kind: "range",
    label: "Drift",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const CLOTHS: { value: TartanShiftPalette; name: string }[] = [
  { value: "highland", name: "Highland" },
  { value: "modern", name: "Modern" },
  { value: "earth", name: "Earth" },
];

/**
 * The Fernworks Mill winter cloth: the hero is the cloth itself, and the
 * three weaves of the season re-thread it.
 */
export function TartanShiftDemo({
  chrome = true,
  // The cloth is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const tweaked = values.palette ?? tweaks.palette.default;
  const sett = values.sett ?? tweaks.sett.default;
  // The picker follows the tweak panel, and the visitor can pick on top.
  const [cloth, setCloth] = React.useState({ from: tweaked, value: tweaked });
  if (cloth.from !== tweaked) setCloth({ from: tweaked, value: tweaked });
  const chips = React.useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (index: number) => {
    const next = CLOTHS[(index + CLOTHS.length) % CLOTHS.length];
    if (!next) return;
    setCloth((c) => ({ ...c, value: next.value }));
    chips.current[CLOTHS.indexOf(next)]?.focus();
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <TartanShift
        className={cn("w-full rounded-3", chrome ? "h-64" : "h-52")}
        {...values}
        palette={cloth.value}
      >
        <div className="flex h-full items-center justify-center p-4">
          <div className="max-w-[85%] rounded-3 border border-hairline bg-background/90 px-4 py-3 text-center shadow-sm">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fernworks Mill
            </p>
            <p className="mt-1 text-lg leading-tight font-medium text-foreground">
              Winter cloth
            </p>
            <p className="mt-1 text-xs text-balance text-ink-2">
              Woven on our own looms, three setts this season
            </p>
          </div>
        </div>
      </TartanShift>
      {chrome ? (
        <>
          <div
            role="radiogroup"
            aria-label="Cloth"
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {CLOTHS.map((c, i) => {
              const on = c.value === cloth.value;
              return (
                <button
                  key={c.value}
                  ref={(node) => {
                    chips.current[i] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => choose(i)}
                  onKeyDown={(event) => {
                    const step =
                      event.key === "ArrowRight" || event.key === "ArrowDown"
                        ? 1
                        : event.key === "ArrowLeft" || event.key === "ArrowUp"
                          ? -1
                          : 0;
                    if (step !== 0) {
                      event.preventDefault();
                      choose(i + step);
                    } else if (event.key === "Home" || event.key === "End") {
                      event.preventDefault();
                      choose(event.key === "Home" ? 0 : CLOTHS.length - 1);
                    }
                  }}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3 text-xs transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    on
                      ? "border-hairline-strong bg-surface-2 text-foreground"
                      : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{cloth.value}</span> · {sett} sett ·
            scroll to drift
          </p>
        </>
      ) : null}
    </div>
  );
}
