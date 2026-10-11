"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { OffRegister } from "@/registry/ui/off-register";

export const tweaks = defineTweaks({
  plates: {
    kind: "range",
    label: "Plates",
    default: 4,
    min: 2,
    max: 4,
    step: 1,
  },
  slip: {
    kind: "range",
    label: "Slip",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  paperTone: {
    kind: "choice",
    label: "Paper",
    default: "cream",
    options: ["cream", "white", "kraft", "slate"],
    names: { cream: "Cream", white: "White", kraft: "Kraft", slate: "Slate" },
  },
});

/** A pixel at 96 per inch, in millimetres: the press measures slip in mm. */
const MM = 0.2646;

/**
 * A Gaugeworks Press broadside proof: the headline pulled in four inks,
 * slipping out of register wherever a hand passes over the sheet.
 */
export function OffRegisterDemo({
  chrome = true,
  // The press is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [register, setRegister] = React.useState({ held: true, slip: 0 });

  const sheet = (
    <div className="@container w-full">
      <OffRegister
        as="h2"
        text="Printed in four inks"
        caption={chrome ? "Gaugeworks Press · proof 3 of 12" : undefined}
        onRegisterChange={(held, slip) => setRegister({ held, slip })}
        className="text-center text-[clamp(1.6rem,8cqi,3.4rem)] leading-[1.05] font-semibold tracking-tight"
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full">{sheet}</div>;

  const mm = (register.slip * MM).toFixed(1);

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      {sheet}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {register.held ? (
          <>
            <span className="text-signal">in register</span>
            {register.slip > 0 ? ` · last slip ${mm} mm` : " · pass over it"}
          </>
        ) : (
          <>
            <span className="text-signal">off register</span> · the plates are
            slipping
          </>
        )}
      </p>
    </div>
  );
}
