"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AwardSeal } from "@/registry/ui/award-seal";

export const tweaks = defineTweaks({
  foil: {
    kind: "choice",
    label: "Foil",
    default: "gold",
    options: ["gold", "silver", "bronze"],
    names: { gold: "Gold", silver: "Silver", bronze: "Bronze" },
  },
  ribbons: { kind: "toggle", label: "Ribbons", default: true },
  swing: {
    kind: "range",
    label: "Swing",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline Running Club's finisher certificate for the Spring 10K: press
 * the seal to sign and seal it.
 */
export function AwardSealDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sealed, setSealed] = React.useState(false);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <AwardSeal
        issuer="Fieldline Running Club"
        award="Certificate of Completion"
        recipient="Mara Okafor"
        citation="For finishing the Spring 10K on the river course in 47:12."
        date="12 Oct 2026"
        signer="J. Ellery"
        signerTitle="Race director"
        sealed={sealed}
        onSealedChange={setSealed}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {sealed ? (
            <>
              <span className="text-signal">sealed</span> · signed by j. ellery
              · 12 oct 2026
            </>
          ) : (
            <>
              <span className="text-signal">awaiting signature</span> · press
              the seal
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
