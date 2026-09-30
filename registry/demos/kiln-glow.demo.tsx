"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { KilnGlow } from "@/registry/ui/kiln-glow";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  heat: {
    kind: "range",
    label: "Heat",
    default: 0.8,
    min: 0,
    max: 1,
    step: 0.05,
  },
  glaze: {
    kind: "choice",
    label: "Glaze",
    default: "copper",
    options: ["iron", "copper", "ash"],
    names: { iron: "Iron", copper: "Copper", ash: "Ash" },
  },
});

const PHRASES = ["Warming the kiln", "Firing the glaze", "Holding at peak"];

/** A firing's length, how often the kiln reports, and its rest once done. */
const RUN_MS = 9000;
const STEP_MS = 150;
const REST_MS = 2600;

/** The kiln's temperature for a share of the firing, °C. */
const celsius = (p: number) => Math.round(20 + p * 1220);

/**
 * Fernworks Pottery firing a batch of glazed mugs: the status line takes the
 * kiln's heat as the firing climbs, then cools to the glaze.
 */
export function KilnGlowDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [progress, setProgress] = React.useState(0);
  const [firing, setFiring] = React.useState(true);
  const [run, setRun] = React.useState(0);

  // The firing climbs once it arrives, rests at the top, and is set.
  React.useEffect(() => {
    if (!firing) return;
    const started = performance.now();
    let rest = 0;
    const timer = window.setInterval(() => {
      const share = Math.min(1, (performance.now() - started) / RUN_MS);
      setProgress(Math.round(share * 100) / 100);
      if (share >= 1) {
        window.clearInterval(timer);
        rest = window.setTimeout(() => setFiring(false), REST_MS);
      }
    }, STEP_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(rest);
    };
  }, [firing, run]);

  // The gallery card has no button: it fires the next batch by itself.
  React.useEffect(() => {
    if (chrome || firing) return;
    const again = window.setTimeout(() => {
      setProgress(0);
      setFiring(true);
      setRun((r) => r + 1);
    }, REST_MS + 1000);
    return () => window.clearTimeout(again);
  }, [chrome, firing]);

  const kiln = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks Pottery · kiln 2
      </p>
      <KilnGlow
        phrases={PHRASES}
        progress={progress}
        active={firing}
        doneText="Glaze set"
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-80">{kiln}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {kiln}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {firing ? (
            <>
              <span className="text-signal">firing</span> ·{" "}
              {Math.round(progress * 100)}% · {celsius(progress)} °C
            </>
          ) : (
            <>
              <span className="text-signal">fired</span> · glaze set
            </>
          )}
        </p>
        <button
          type="button"
          disabled={firing}
          onClick={() => {
            setProgress(0);
            setFiring(true);
            setRun((r) => r + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Fire again
        </button>
      </div>
    </div>
  );
}
