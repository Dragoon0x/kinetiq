"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { Slingshot } from "@/registry/ui/slingshot";

export const tweaks = defineTweaks({
  tension: {
    kind: "range",
    label: "Tension",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pull: {
    kind: "range",
    label: "Pull",
    default: 72,
    min: 32,
    max: 120,
    step: 8,
    unit: "px",
  },
  distance: {
    kind: "range",
    label: "Distance",
    default: 140,
    min: 60,
    max: 240,
    step: 20,
    unit: "px",
  },
});

/** How long a Gaugeworks deploy takes once it is launched. */
const DEPLOY_MS = 1600;

/**
 * A Gaugeworks release panel: the next build ships to production when you
 * pull the Deploy button back and let it go.
 */
export function SlingshotDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [deploying, setDeploying] = React.useState(false);
  const [build, setBuild] = React.useState(482);
  const [live, setLive] = React.useState<number | null>(null);
  const [count, setCount] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onLaunchedChange = (next: boolean) => {
    if (!next || deploying) return;
    setDeploying(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setDeploying(false);
      setLive(build);
      setBuild((b) => b + 1);
      setCount((c) => c + 1);
    }, DEPLOY_MS);
  };

  const panel = (
    <div className="w-full max-w-md rounded-3 border border-hairline bg-card px-4 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm font-medium text-foreground tabular-nums">
          Build {build} · production
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks
        </p>
      </div>
      <Slingshot
        label="Deploy"
        launchedLabel="Deploying"
        launched={deploying}
        onLaunchedChange={onLaunchedChange}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{panel}</div>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {deploying ? (
          <>
            <span className="text-signal">deploying build {build}</span> ·
            production
          </>
        ) : live !== null ? (
          <>
            <span className="text-signal">build {live} is live</span> ·{" "}
            {count === 1 ? "1 deploy today" : `${count} deploys today`}
          </>
        ) : (
          <>
            <span className="text-signal">ready</span> · pull back or press
            enter
          </>
        )}
      </p>
    </div>
  );
}
