"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultGuests, GuestPointers } from "@/registry/ui/guest-pointers";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Guests",
    default: 3,
    min: 1,
    max: 5,
    step: 1,
  },
  tagStyle: {
    kind: "choice",
    label: "Tags",
    default: "pill",
    options: ["pill", "flag", "initials"],
    names: { pill: "Pill", flag: "Flag", initials: "Initials" },
  },
  smoothing: {
    kind: "range",
    label: "Smoothing",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  bubbles: { kind: "toggle", label: "Chat", default: true },
});

/**
 * The Coldbrook team in their spring launch plan: a few of them are in the
 * document right now. Click a name to ride along with them.
 */
export function GuestPointersDemo({
  chrome = true,
  // The pointers are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [following, setFollowing] = React.useState<string | null>(null);
  const count = values.count ?? tweaks.count.default;
  const who = defaultGuests.find((g) => g.id === following);

  const view = (
    <GuestPointers
      label="Coldbrook spring launch plan"
      following={following}
      onFollowingChange={setFollowing}
      className={chrome ? "h-[480px]" : "h-[540px]"}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{view}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · launch plan
        </p>
        <p className="text-base font-medium text-foreground">
          Live with the team
        </p>
      </div>
      {view}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{count} here</span> ·{" "}
        {who
          ? `following ${who.name.split(" ")[0]?.toLowerCase()}`
          : "overview"}
      </p>
    </div>
  );
}
