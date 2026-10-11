"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MitreJoint } from "@/registry/ui/mitre-joint";

export const tweaks = defineTweaks({
  profile: {
    kind: "choice",
    label: "Profile",
    default: "gilt",
    options: ["flat", "cove", "gilt"],
    names: { flat: "Flat", cove: "Cove", gilt: "Gilt" },
  },
  bevel: {
    kind: "range",
    label: "Bevel",
    default: 14,
    min: 6,
    max: 28,
    step: 2,
    unit: "px",
  },
  glow: {
    kind: "choice",
    label: "Glow",
    default: "gold",
    options: ["gold", "accent", "frost", "ember"],
    names: { gold: "Gold", accent: "Accent", frost: "Frost", ember: "Ember" },
  },
});

/** This month's print, drawn in code: a harbour at first light. */
function HarbourPrint() {
  return (
    <svg
      viewBox="0 0 120 90"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
      aria-hidden
    >
      <rect width="120" height="90" fill="oklch(0.86 0.05 60)" />
      <rect width="120" height="34" fill="oklch(0.8 0.06 40)" />
      <circle cx="84" cy="40" r="9" fill="oklch(0.95 0.06 85)" />
      <rect y="46" width="120" height="44" fill="oklch(0.5 0.06 235)" />
      <rect y="46" width="120" height="3" fill="oklch(0.72 0.06 60)" />
      <path
        d="M 76 52 h 16 M 72 58 h 22 M 79 64 h 10"
        stroke="oklch(0.88 0.07 80)"
        strokeWidth="1.2"
      />
      <path
        d="M 0 46 L 18 36 L 30 42 L 44 34 L 58 46 Z"
        fill="oklch(0.4 0.04 260)"
      />
      <path d="M 22 66 h 24 l -4 6 h -16 z" fill="oklch(0.24 0.03 260)" />
      <path d="M 33 66 v -20 l 11 18 z" fill="oklch(0.92 0.02 80)" />
      <path d="M 60 72 h 16 l -3 4 h -10 z" fill="oklch(0.26 0.03 260)" />
      <path d="M 67 72 v -12 l 7 11 z" fill="oklch(0.9 0.02 80)" />
    </svg>
  );
}

/**
 * Fieldline Print Club's October card, framed: the four lengths come in when
 * the card is seen, and Replay frames it again with the click.
 */
export function MitreJointDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [assembled, setAssembled] = React.useState<boolean | undefined>();
  const [seated, setSeated] = React.useState(false);
  const timer = React.useRef(0);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const replay = () => {
    window.clearTimeout(timer.current);
    setSeated(false);
    setAssembled(false);
    timer.current = window.setTimeout(() => setAssembled(true), 420);
  };

  const framed = (
    <MitreJoint
      assembled={assembled}
      onAssembled={() => setSeated(true)}
      sound={sound}
      contentClassName="bg-card"
      {...values}
    >
      <div className="@container">
        <div className="flex items-center gap-4 p-4 @[26rem]:gap-5">
          <div className="hidden aspect-[4/3] w-28 shrink-0 overflow-clip rounded-1 border border-hairline @[26rem]:block">
            <HarbourPrint />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fieldline Print Club · October
            </p>
            <h3 className="mt-1 text-base leading-snug font-medium text-foreground">
              Harbour, first light
            </h3>
            <p className="mt-0.5 text-xs text-ink-2">
              Giclée on cotton rag · edition of 40
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Reserve a print
              </button>
              <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                12 of 40 left
              </span>
            </div>
          </div>
        </div>
      </div>
    </MitreJoint>
  );

  if (!chrome) return <div className="w-full max-w-xl">{framed}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      {framed}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {seated ? (
            <>
              <span className="text-signal">corners seated</span> · hover to
              move the light
            </>
          ) : (
            <>
              <span className="text-signal">framing</span> · four lengths
            </>
          )}
        </p>
        <button
          type="button"
          onClick={replay}
          className="inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-foreground outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
