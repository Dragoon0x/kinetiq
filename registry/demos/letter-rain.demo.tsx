"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LetterRain } from "@/registry/ui/letter-rain";

export const tweaks = defineTweaks({
  gravity: {
    kind: "range",
    label: "Gravity",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  bounce: {
    kind: "range",
    label: "Bounce",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  trigger: {
    kind: "choice",
    label: "Trigger",
    default: "press",
    options: ["press", "hover", "inView", "mount"],
    names: {
      press: "Press",
      hover: "Hover",
      inView: "In view",
      mount: "Mount",
    },
  },
});

const HOW: Record<string, string> = {
  press: "press the line to drop it",
  hover: "point at the line to drop it",
  inView: "it drops as it comes into view",
  mount: "it drops as it arrives",
};

/**
 * Fieldline's end-of-season sale: the banner takes its own advice, and the
 * shopper can pick the letters up and throw them about.
 */
export function LetterRainDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [fallen, setFallen] = React.useState(false);
  const how = HOW[values.trigger ?? tweaks.trigger.default] ?? HOW.press;

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline · end of season
      </p>
      <LetterRain
        as="h2"
        text="Everything must go"
        fallen={fallen}
        onFallenChange={setFallen}
        // The gallery card tidies itself up; on the stage the shopper does.
        reassembleAfter={chrome ? 0 : 2600}
        sound={sound}
        className="text-[clamp(1.75rem,8cqi,3.25rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-foreground"
        {...values}
      />
      <p className="text-sm text-ink-2">
        Up to 40% off the spring range, this week only.
      </p>
      {chrome ? (
        <p
          role="status"
          className="mt-1 border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {fallen ? (
            <>
              <span className="text-signal">on the floor</span> · drag a letter
              to throw it
            </>
          ) : (
            <>
              <span className="text-signal">standing</span> · {how}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
