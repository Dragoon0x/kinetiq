"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DitherDunes } from "@/registry/ui/dither-dunes";

export const tweaks = defineTweaks({
  matrix: {
    kind: "choice",
    label: "Matrix",
    default: "bayer4",
    options: ["bayer2", "bayer4", "bayer8", "dots"],
    names: { bayer2: "2×2", bayer4: "4×4", bayer8: "8×8", dots: "Dots" },
  },
  scale: {
    kind: "range",
    label: "Dot size",
    default: 2,
    min: 1,
    max: 6,
    step: 1,
    unit: "px",
  },
  colors: {
    kind: "choice",
    label: "Inks",
    default: "riso",
    options: ["mono", "riso", "sienna", "tide"],
    names: { mono: "Mono", riso: "Riso", sienna: "Sienna", tide: "Tide" },
  },
});

const MATRIX_NAMES: Record<string, string> = {
  bayer2: "2×2 matrix",
  bayer4: "4×4 matrix",
  bayer8: "8×8 matrix",
  dots: "dot screen",
};

/**
 * Fieldline Atlas prints field guides on a risograph: the hero is the dune
 * sea from the air, in the same two or three inks as the book.
 */
export function DitherDunesDemo({
  chrome = true,
  // The print is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [lit, setLit] = React.useState(false);
  const [flashing, setFlashing] = React.useState(false);
  const flashTimer = React.useRef<number | null>(null);
  const matrix = values.matrix ?? "bayer4";
  const scale = values.scale ?? 2;
  const colors = values.colors ?? "riso";

  const onFlash = React.useCallback(() => {
    setFlashing(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      flashTimer.current = null;
      setFlashing(false);
    }, 900);
  }, []);

  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const print = (
    <DitherDunes
      onActiveChange={setLit}
      onFlash={onFlash}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/90 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline Atlas
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            The dune sea in two inks
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                A field guide printed on the risograph
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Order a copy
              </button>
            </>
          ) : null}
        </div>
      </div>
    </DitherDunes>
  );

  if (!chrome) return <div className="flex w-full">{print}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {print}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {flashing ? (
          <>
            <span className="text-signal">flash</span> · a ring of light across
            the print
          </>
        ) : lit ? (
          <>
            <span className="text-signal">lit</span> · the print brightens under
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{colors}</span> ·{" "}
            {MATRIX_NAMES[matrix] ?? matrix} · {scale} px dots
          </>
        )}
      </p>
    </div>
  );
}
