"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FollowKnot } from "@/registry/ui/follow-knot";

export const tweaks = defineTweaks({
  tension: {
    kind: "range",
    label: "Tension",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  count: {
    kind: "range",
    label: "Followers",
    default: 1299,
    min: 0,
    max: 9999,
    step: 1,
  },
  compact: { kind: "toggle", label: "Compact", default: false },
});

const grouped = new Intl.NumberFormat("en-US");

/**
 * A creator card in the Fieldline community app: follow the journal, and its
 * follower figure counts you in.
 */
export function FollowKnotDemo({
  chrome = true,
  sound,
  count = tweaks.count.default,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [following, setFollowing] = React.useState(false);
  const total = count + (following ? 1 : 0);
  const followers = `${grouped.format(total)} ${total === 1 ? "follower" : "followers"}`;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-3 border border-hairline bg-card p-4">
        <div className="flex min-w-0 flex-1 basis-44 items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cobalt-wash font-mono text-xs font-medium text-cobalt-bright"
          >
            FJ
          </span>
          <div className="min-w-0">
            <p
              className="truncate text-sm font-medium text-foreground"
              title="Fieldline Journal"
            >
              Fieldline Journal
            </p>
            <p
              className="truncate text-xs text-ink-3"
              title="Weather and soil notes from the field"
            >
              Weather and soil notes from the field
            </p>
          </div>
        </div>
        <FollowKnot
          target="Fieldline Journal"
          pressed={following}
          onPressedChange={setFollowing}
          count={count}
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
            {following ? "following" : "not following"}
          </span>{" "}
          · {followers}
        </p>
      ) : null}
    </div>
  );
}
