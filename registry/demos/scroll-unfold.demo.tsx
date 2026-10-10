"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ScrollUnfold,
  type ScrollUnfoldStage,
} from "@/registry/ui/scroll-unfold";

export const tweaks = defineTweaks({
  range: {
    kind: "range",
    label: "Range",
    default: 400,
    min: 200,
    max: 800,
    step: 40,
    unit: "px",
  },
  inset: {
    kind: "range",
    label: "Inset",
    default: 0.26,
    min: 0.1,
    max: 0.4,
    step: 0.02,
  },
  radius: {
    kind: "range",
    label: "Radius",
    default: 24,
    min: 0,
    max: 40,
    step: 2,
    unit: "px",
  },
});

const BOX = 500;

/** A ridge line at dusk: generated, fixed art, the same in both themes. */
function RidgePlate() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      role="img"
      aria-label="Ridges fading into mist under a low evening sun"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.36 0.06 262)" />
          <stop offset="0.55" stopColor="oklch(0.66 0.08 40)" />
          <stop offset="0.8" stopColor="oklch(0.82 0.09 70)" />
        </linearGradient>
        <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.84 0.04 60)" stopOpacity="0" />
          <stop
            offset="0.5"
            stopColor="oklch(0.84 0.04 60)"
            stopOpacity="0.32"
          />
          <stop offset="1" stopColor="oklch(0.84 0.04 60)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="oklch(0.96 0.06 85)" />
          <stop offset="0.45" stopColor="oklch(0.9 0.1 75)" stopOpacity="0.9" />
          <stop offset="1" stopColor="oklch(0.9 0.1 75)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="800" fill={`url(#${id}-sky)`} />
      <circle cx="760" cy="430" r="150" fill={`url(#${id}-sun)`} />
      <path
        d="M0 470 L120 430 L230 452 L360 398 L470 430 L600 386 L720 420 L840 380 L980 424 L1090 400 L1200 430 L1200 800 L0 800 Z"
        fill="oklch(0.58 0.06 30)"
        opacity="0.55"
      />
      <path
        d="M0 520 L140 470 L260 500 L400 446 L520 488 L650 452 L790 496 L930 450 L1060 486 L1200 460 L1200 800 L0 800 Z"
        fill="oklch(0.46 0.06 300)"
        opacity="0.75"
      />
      <rect y="470" width="1200" height="120" fill={`url(#${id}-mist)`} />
      <path
        d="M0 590 L110 540 L250 572 L380 518 L500 566 L640 530 L760 576 L900 532 L1040 570 L1200 540 L1200 800 L0 800 Z"
        fill="oklch(0.34 0.05 280)"
      />
      <path
        d="M0 680 L150 620 L300 660 L430 610 L580 664 L720 626 L870 676 L1010 632 L1120 664 L1200 640 L1200 800 L0 800 Z"
        fill="oklch(0.23 0.04 268)"
      />
    </svg>
  );
}

const STAGE_SAYS: Record<ScrollUnfoldStage, string> = {
  folded: "scroll the journal",
  unfolding: "keep going",
  unfolded: "scroll back to fold it",
};

/**
 * The Fieldline Journal, issue 12: a long read whose plate opens to fill the
 * page as the reader scrolls past it.
 */
export function ScrollUnfoldDemo({
  chrome = true,
  // The page turns in silence: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = React.useState<ScrollUnfoldStage>("folded");

  const journal = (
    <div
      ref={boxRef}
      tabIndex={0}
      role="region"
      aria-label="Fieldline Journal, issue 12"
      className="h-[500px] w-full overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-background outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
    >
      <div className="flex flex-col gap-3 px-6 pt-8 pb-10">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Journal · Issue 12
        </p>
        <p className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance text-foreground">
          Notes from the ridge
        </p>
        <p className="max-w-prose text-sm text-ink-2">
          Three nights on the Coldbrook ridge with a field camera and a flask.
          The light goes quickly up there; the plate below was made in the last
          four minutes of it.
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Scroll to open the plate
        </p>
      </div>
      <ScrollUnfold
        headline="Above the tree line"
        height={BOX - 2}
        caption="Plate 3 · Coldbrook ridge, 6:42 pm"
        overlay={
          <div className="flex flex-col gap-1 text-[oklch(0.98_0.01_90)]">
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase opacity-80">
              Plate 3 of 9
            </span>
            <span className="text-2xl leading-tight font-semibold tracking-[-0.02em]">
              Coldbrook ridge
            </span>
          </div>
        }
        onStageChange={setStage}
        {...values}
      >
        <RidgePlate />
      </ScrollUnfold>
      <div className="flex flex-col gap-3 px-6 pt-8 pb-12 text-sm text-ink-2">
        <p className="max-w-prose">
          We set up below the saddle at five, when the wind dropped and the
          valley filled with a slow white mist. By half past six the far ridges
          had gone the colour of slate and the near ones had gone dark.
        </p>
        <p className="max-w-prose">
          Next issue: the Basin overlook in snow, and a long exposure from the
          Waylight hut.
        </p>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{journal}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {journal}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{stage}</span> · {STAGE_SAYS[stage]}
        </p>
        <button
          type="button"
          onClick={() =>
            boxRef.current?.scrollTo({
              top: 0,
              behavior: motionSafe ? "smooth" : "auto",
            })
          }
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Back to top
        </button>
      </div>
    </div>
  );
}
