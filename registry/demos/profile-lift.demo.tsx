"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ProfileLift } from "@/registry/ui/profile-lift";

export const tweaks = defineTweaks({
  lift: {
    kind: "range",
    label: "Lift",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 6,
    min: 0,
    max: 10,
    step: 1,
    unit: "deg",
  },
  stats: {
    kind: "choice",
    label: "Stats",
    default: "count",
    options: ["count", "still", "off"],
    names: { count: "Count up", still: "Still", off: "Hidden" },
  },
});

/** Followers before this viewer, as the card's first figure says. */
const FOLLOWERS = 2418;
const grouped = new Intl.NumberFormat("en-US");

/**
 * Fieldline's people directory: Ines Calder's card, followed or not, opened
 * into her full profile or left as a card.
 */
export function ProfileLiftDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [following, setFollowing] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const followers = FOLLOWERS + (following ? 1 : 0);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <ProfileLift
        following={following}
        onFollowingChange={setFollowing}
        expanded={open}
        onExpandedChange={setOpen}
        sound={sound}
        {...values}
        className="self-center"
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {following ? "following" : "not following"}
          </span>
          {` · ${grouped.format(followers)} followers · `}
          {open ? "sheet open" : "sheet closed"}
        </p>
      ) : null}
    </div>
  );
}
