"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { EmbossCard, type EmbossCardDetail } from "@/registry/ui/emboss-card";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  stock: {
    kind: "choice",
    label: "Stock",
    default: "cotton",
    options: ["cotton", "kraft", "black"],
    names: { cotton: "Cotton", kraft: "Kraft", black: "Black" },
  },
  light: { kind: "toggle", label: "Light", default: true },
});

const DETAILS: EmbossCardDetail[] = [
  {
    label: "Email",
    value: "ilse@fernworks.studio",
    href: "mailto:ilse@fernworks.studio",
  },
  { label: "Phone", value: "+44 20 7946 0321", href: "tel:+442079460321" },
  { label: "Studio", value: "4 Ropewalk Yard, Saltings" },
  {
    label: "Web",
    value: "fernworks.studio",
    href: "https://fernworks.studio",
  },
];

/**
 * The card of a planting designer at Fernworks, a landscape studio: turn it
 * over for the details, copy them into your contacts.
 */
export function EmbossCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [flipped, setFlipped] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <EmbossCard
        name="Ilse Marrow"
        title="Planting designer"
        company="Fernworks"
        details={DETAILS}
        flipped={flipped}
        onFlippedChange={(next) => {
          setFlipped(next);
          setCopied(false);
        }}
        onCopy={() => setCopied(true)}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {copied ? (
            <>
              <span className="text-signal">copied</span> · contact on the
              clipboard
            </>
          ) : flipped ? (
            <>
              <span className="text-signal">details</span> ·
              ilse@fernworks.studio
            </>
          ) : (
            <>
              <span className="text-signal">front</span> · drag or tap to turn
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
