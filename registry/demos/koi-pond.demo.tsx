"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { KoiPond } from "@/registry/ui/koi-pond";

export const tweaks = defineTweaks({
  fish: {
    kind: "range",
    label: "Fish",
    default: 7,
    min: 3,
    max: 12,
    step: 1,
  },
  ripple: {
    kind: "range",
    label: "Ripple",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  water: {
    kind: "choice",
    label: "Water",
    default: "jade",
    options: ["jade", "ink", "dusk"],
    names: { jade: "Jade", ink: "Ink", dusk: "Dusk" },
  },
});

/**
 * Basinworks Tea Garden's opening hours over its own pond: the koi keep
 * their distance from a passing hand and scatter from a touch.
 */
export function KoiPondDemo({
  chrome = true,
  // The pond is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [scattered, setScattered] = React.useState<number | null>(null);
  const [touches, setTouches] = React.useState(0);
  const total = values.fish ?? 7;

  // The koi take a few seconds to come back; the line says so until then.
  React.useEffect(() => {
    if (scattered === null) return;
    const calm = window.setTimeout(() => setScattered(null), 4000);
    return () => window.clearTimeout(calm);
  }, [scattered, touches]);

  const pond = (
    <KoiPond
      label="Koi pond behind the Basinworks Tea Garden banner"
      onScatter={(n) => {
        setScattered(n);
        setTouches((t) => t + 1);
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Tea Garden
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            The pond is open until dusk
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Benches by the water, 9 to 6
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Book a bench
              </button>
            </>
          ) : null}
        </div>
      </div>
    </KoiPond>
  );

  if (!chrome) return <div className="flex w-full">{pond}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {pond}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {scattered === null ? (
          <>
            <span className="text-signal">{total} koi</span> · the pond is calm
          </>
        ) : scattered === 0 ? (
          <>
            <span className="text-signal">a ring</span> · no koi were close
          </>
        ) : (
          <>
            <span className="text-signal">
              {scattered} of {total} scattered
            </span>{" "}
            · they come back
          </>
        )}
      </p>
    </div>
  );
}
