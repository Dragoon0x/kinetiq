"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  StainedGlass,
  type StainedGlassLight,
} from "@/registry/ui/stained-glass";

export const tweaks = defineTweaks({
  panes: {
    kind: "range",
    label: "Panes",
    default: 36,
    min: 12,
    max: 60,
    step: 4,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cathedral",
    options: ["cathedral", "sea", "dusk"],
    names: { cathedral: "Cathedral", sea: "Sea", dusk: "Dusk" },
  },
});

/** A ninth of the window, in words: coarse, so the status speaks rarely. */
const ninth = ({ x, y }: StainedGlassLight) => {
  const col = x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "";
  const row = y < 1 / 3 ? "top" : y > 2 / 3 ? "bottom" : "";
  return [row, col].filter(Boolean).join(" ") || "centre";
};

/**
 * The Fernworks Glass Studio's open day: the studio's own window behind the
 * notice, lit wherever the visitor holds the light.
 */
export function StainedGlassDemo({
  chrome = true,
  // The window is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [seed, setSeed] = React.useState(1);
  const [place, setPlace] = React.useState<string | null>(null);
  const [fresh, setFresh] = React.useState(false);
  const glass = values.palette ?? tweaks.palette.default;
  const count = values.panes ?? tweaks.panes.default;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <StainedGlass
        seed={seed}
        onLightChange={(light) => {
          setFresh(false);
          setPlace(light ? ninth(light) : null);
        }}
        className={cn("w-full rounded-3", chrome ? "h-60" : "h-52")}
        {...values}
      >
        <div className="flex h-full items-center justify-center p-4">
          <div className="max-w-[85%] rounded-3 border border-hairline bg-background/85 px-4 py-3 text-center backdrop-blur-sm">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fernworks Glass Studio
            </p>
            <p className="mt-1 text-lg leading-tight font-medium text-foreground">
              Open studio, Saturday
            </p>
            <p className="mt-1 text-xs text-balance text-ink-2">
              Leading, cutting and firing from ten till four
            </p>
          </div>
        </div>
      </StainedGlass>
      {chrome ? (
        <>
          <button
            type="button"
            onClick={() => {
              setSeed((s) => s + 1);
              setFresh(true);
            }}
            className="inline-flex h-8 items-center self-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            New window
          </button>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">
              {fresh
                ? `window ${seed} leaded`
                : place
                  ? `light ${place}`
                  : "light at rest"}
            </span>{" "}
            · {glass} · {count} panes
          </p>
        </>
      ) : null}
    </div>
  );
}
