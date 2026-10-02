"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultTeam, TeamFan } from "@/registry/ui/team-fan";

export const tweaks = defineTweaks({
  spread: {
    kind: "range",
    label: "Spread",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  cascade: {
    kind: "range",
    label: "Cascade",
    default: 40,
    min: 0,
    max: 120,
    step: 10,
    unit: "ms",
  },
  focus: {
    kind: "range",
    label: "Focus",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Heard =
  | { kind: "idle" }
  | { kind: "invite" }
  | { kind: "all" }
  | { kind: "message"; id: string };

/**
 * Basinworks' Platform crew on a team page: hover or tab into the stack to
 * meet everyone, press a face to see who they are and whether they are
 * around.
 */
export function TeamFanDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [focused, setFocused] = React.useState<string | null>(null);
  const [heard, setHeard] = React.useState<Heard>({ kind: "idle" });
  const person = defaultTeam.find((m) => m.id === focused);
  const online = defaultTeam.filter((m) => m.presence === "online").length;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <TeamFan
        value={focused}
        onValueChange={(id) => {
          setFocused(id);
          setHeard({ kind: "idle" });
        }}
        onInvite={() => setHeard({ kind: "invite" })}
        onShowAll={() => setHeard({ kind: "all" })}
        onMessage={(id) => setHeard({ kind: "message", id })}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {heard.kind === "invite" ? (
            <>
              <span className="text-signal">invite opened</span> · platform crew
            </>
          ) : heard.kind === "all" ? (
            <>
              <span className="text-signal">all {defaultTeam.length}</span> ·{" "}
              {online} online
            </>
          ) : heard.kind === "message" && person ? (
            <>
              <span className="text-signal">message</span> · {person.name}
            </>
          ) : person ? (
            <>
              <span className="text-signal">{person.name}</span> · {person.role}{" "}
              · {person.presence}
            </>
          ) : (
            <>
              <span className="text-signal">{defaultTeam.length} members</span>{" "}
              · {online} online · hover or tab in
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
