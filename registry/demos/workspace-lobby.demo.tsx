"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultLobbyInvitations,
  defaultLobbyWorkspaces,
  WorkspaceLobby,
  type LobbyInvitation,
  type LobbyStatus,
} from "@/registry/ui/workspace-lobby";

export const tweaks = defineTweaks({
  doorStyle: {
    kind: "choice",
    label: "Doors",
    default: "hinge",
    options: ["hinge", "slide", "fade"],
    names: { hinge: "Hinge", slide: "Slide", fade: "Fade" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Glimpse",
    default: "workspace",
    options: ["workspace", "cobalt", "ink"],
    names: { workspace: "Own hue", cobalt: "Cobalt", ink: "Ink" },
  },
});

/** More envelopes the host can drop on the side table. */
const MORE_INVITATIONS: LobbyInvitation[] = [
  {
    id: "inv-harrow",
    workspaceId: "harrow",
    workspaceName: "Harrow Freight",
    invitedBy: "Priya Nair",
    role: "member",
    members: 22,
    plan: "business",
    hue: "amber",
  },
  {
    id: "inv-saltmarsh",
    workspaceId: "saltmarsh",
    workspaceName: "Saltmarsh",
    invitedBy: "Tomas Reyes",
    role: "guest",
    members: 3,
    plan: "free",
    hue: "violet",
  },
  {
    id: "inv-orrery",
    workspaceId: "orrery",
    workspaceName: "Orrery",
    invitedBy: "Ines Varga",
    role: "admin",
    members: 11,
    plan: "team",
    hue: "cobalt",
  },
];

/**
 * Ines signs in to Coldbrook on a Monday morning: four workspaces stand as
 * doors, two invitations wait on the side table, and Fieldline is the one
 * she opened last.
 */
export function WorkspaceLobbyDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<string | null>(
    defaultLobbyWorkspaces[0]?.id ?? null,
  );
  const [opened, setOpened] = React.useState<string | null>(null);
  const [remember, setRemember] = React.useState(false);
  const [invitations, setInvitations] = React.useState<LobbyInvitation[]>(
    defaultLobbyInvitations,
  );
  const [answered, setAnswered] = React.useState({ accepted: 0, declined: 0 });
  const [status, setStatus] = React.useState<LobbyStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [seq, setSeq] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const invite = () => {
    const next = MORE_INVITATIONS.find(
      (inv) => !invitations.some((i) => i.id === inv.id),
    );
    if (next) setInvitations((list) => [...list, next]);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setValue(defaultLobbyWorkspaces[0]?.id ?? null);
    setOpened(null);
    setRemember(false);
    setInvitations(defaultLobbyInvitations);
    setAnswered({ accepted: 0, declined: 0 });
    setStatus("ready");
    setFailNext(false);
    setSeq((n) => n + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <WorkspaceLobby height={540} {...values} />
      </div>
    );
  }

  const chosenName =
    defaultLobbyWorkspaces.find((w) => w.id === value)?.name ??
    (value === "__create" ? "new workspace" : (value ?? "nothing"));
  const canInvite = MORE_INVITATIONS.some(
    (inv) => !invitations.some((i) => i.id === inv.id),
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <WorkspaceLobby
        key={seq}
        height={540}
        value={value}
        onChange={setValue}
        onReady={(workspace) => setOpened(workspace.name)}
        remember={remember}
        onRememberChange={setRemember}
        invitations={invitations}
        onAccept={() =>
          setAnswered((a) => ({ ...a, accepted: a.accepted + 1 }))
        }
        onDecline={() =>
          setAnswered((a) => ({ ...a, declined: a.declined + 1 }))
        }
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status === "ready"
              ? opened
                ? `opened ${opened}`
                : `${chosenName} chosen`
              : status === "loading"
                ? "loading"
                : "load failed"}
          </span>{" "}
          · remember {remember ? "on" : "off"} · {answered.accepted} accepted ·{" "}
          {answered.declined} declined
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={invite}
            aria-disabled={!canInvite || undefined}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:text-ink-3 aria-disabled:hover:bg-transparent"
          >
            New invitation
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
