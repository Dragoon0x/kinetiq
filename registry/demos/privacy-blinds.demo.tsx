"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PrivacyBlinds } from "@/registry/ui/privacy-blinds";

export const tweaks = defineTweaks({
  slats: {
    kind: "range",
    label: "Slats",
    default: 5,
    min: 3,
    max: 8,
    step: 1,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 15,
    min: 0,
    max: 45,
    step: 5,
    unit: "°",
  },
  beam: {
    kind: "range",
    label: "Beam",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * A document's visibility in Fieldline Docs: public to anyone with the link,
 * or private to the people already on it.
 */
export function PrivacyBlindsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [isPrivate, setPrivate] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-3 border border-hairline bg-card px-4 py-3">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-medium text-foreground"
            title="Q4 launch plan"
          >
            Q4 launch plan
          </p>
          <p className="truncate text-xs text-ink-3">
            Fieldline Docs · edited 2 h ago
          </p>
        </div>
        <PrivacyBlinds
          pressed={isPrivate}
          onPressedChange={setPrivate}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {isPrivate ? "private" : "public"}
          </span>
          {isPrivate
            ? " · only you and 3 editors"
            : " · anyone with the link can view"}
        </p>
      ) : null}
    </div>
  );
}
