"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { OilFilm } from "@/registry/ui/oil-film";

export const tweaks = defineTweaks({
  thickness: {
    kind: "range",
    label: "Thickness",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  swirl: {
    kind: "range",
    label: "Swirl",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  saturation: {
    kind: "range",
    label: "Saturation",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Basinworks Finishes, a maker of iridescent lacquers: the range is announced
 * over the colour itself, a film of oil you can stir.
 */
export function OilFilmDemo({
  chrome = true,
  // The film is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [stirring, setStirring] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const quiet = React.useRef(0);
  const thickness = values.thickness ?? 0.45;
  const swirl = values.swirl ?? 0.5;

  React.useEffect(() => () => window.clearTimeout(quiet.current), []);

  // The status names a touch while its rings spread, then rests.
  const onTouchFilm = () => {
    setTouched(true);
    window.clearTimeout(quiet.current);
    quiet.current = window.setTimeout(() => setTouched(false), 2400);
  };

  const film = (
    <OilFilm
      onActiveChange={setStirring}
      onTouchFilm={onTouchFilm}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-5">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Finishes
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Colour that changes as you pass
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">Six lacquers, one coat</p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the finishes
              </button>
            </>
          ) : null}
        </div>
      </div>
    </OilFilm>
  );

  if (!chrome) return <div className="flex w-full">{film}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {film}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {touched ? (
          <>
            <span className="text-signal">touched</span> · rings spreading
          </>
        ) : stirring ? (
          <>
            <span className="text-signal">stirring</span> · the film follows
          </>
        ) : (
          <>
            <span className="text-signal">film {thickness.toFixed(2)}</span> ·
            swirl {swirl.toFixed(2)} · drifting
          </>
        )}
      </p>
    </div>
  );
}
