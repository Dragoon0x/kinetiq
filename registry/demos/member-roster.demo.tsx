"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultRosterInvites,
  defaultRosterMembers,
  defaultRosterRoles,
  MemberRoster,
  type RosterInvite,
  type RosterMember,
} from "@/registry/ui/member-roster";

export const tweaks = defineTweaks({
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  invite: {
    kind: "choice",
    label: "Invite",
    default: "inline",
    options: ["inline", "drawer", "off"],
    names: { inline: "Inline", drawer: "Drawer", off: "Off" },
  },
  roles: {
    kind: "choice",
    label: "Roles",
    default: "menu",
    options: ["menu", "segmented"],
    names: { menu: "Menu", segmented: "Segmented" },
  },
});

const SEATS = 10;

const roleName = (id: string) =>
  defaultRosterRoles.find((r) => r.id === id)?.name.toLowerCase() ?? id;

/**
 * The Basinworks workspace: an owner, two admins, members and a viewer from
 * a partner team, with two invites still waiting.
 */
export function MemberRosterDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [members, setMembers] =
    React.useState<RosterMember[]>(defaultRosterMembers);
  const [invites, setInvites] =
    React.useState<RosterInvite[]>(defaultRosterInvites);
  const [note, setNote] = React.useState<string | null>(null);

  const roster = (
    <MemberRoster
      members={members}
      onMembersChange={setMembers}
      invites={invites}
      onInvitesChange={setInvites}
      seats={SEATS}
      onRoleChange={(id, role) => {
        const m = members.find((x) => x.id === id);
        setNote(
          `${m?.name.toLowerCase() ?? "someone"} is now ${roleName(role)}`,
        );
      }}
      onRemove={(id) => {
        const m = members.find((x) => x.id === id);
        setNote(`removed ${m?.name.toLowerCase() ?? "someone"}`);
      }}
      onInvite={(emails, role) =>
        setNote(
          `${emails.length} ${emails.length === 1 ? "invite" : "invites"} sent · as ${roleName(role)}`,
        )
      }
      onResend={(id) => {
        const inv = invites.find((x) => x.id === id);
        setNote(`resent to ${inv?.email.split("@")[0] ?? "them"}@…`);
      }}
      onRevoke={(id) => {
        const inv = invites.find((x) => x.id === id);
        setNote(`revoked ${inv?.email.split("@")[0] ?? "an invite"}@…`);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{roster}</div>;

  const used = members.length + invites.length;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {roster}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {members.length} members · {invites.length} pending
              </span>{" "}
              · {used} of {SEATS} seats
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setMembers(defaultRosterMembers);
            setInvites(defaultRosterInvites);
            setNote(null);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
