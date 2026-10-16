"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultLobbyInvitations,
  defaultLobbyNow,
  defaultLobbyWorkspaces,
  WorkspaceLobby,
  type LobbyInvitation,
  type LobbyWorkspace,
} from "@/registry/ui/workspace-lobby";

export const tweaks = defineTweaks({
  tileStyle: {
    kind: "choice",
    label: "Tiles",
    default: "card",
    options: ["card", "row", "poster"],
    names: { card: "Card", row: "Row", poster: "Poster" },
  },
  columns: {
    kind: "range",
    label: "Columns",
    default: 3,
    min: 1,
    max: 4,
    step: 1,
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** What each joined invitation becomes once it is a workspace. */
const SPACES: Record<string, string[]> = {
  gaugeworks: ["Meter rounds", "Calibration log", "Depot B"],
  "waylight-studio": ["Brand kit", "Launch film", "Reviews"],
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Mara has just signed in to Waylight and lands in her lobby: three
 * workspaces she belongs to and two invitations. Basinworks fails to open
 * the first time so the fold-back has something to say.
 */
export function WorkspaceLobbyDemo({
  chrome = true,
  // The lobby is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [workspaces, setWorkspaces] = React.useState<LobbyWorkspace[]>(
    defaultLobbyWorkspaces,
  );
  const [invitations, setInvitations] = React.useState<LobbyInvitation[]>(
    defaultLobbyInvitations,
  );
  const [active, setActive] = React.useState<string>("coldbrook");
  const [note, setNote] = React.useState<string | null>(null);
  const failed = React.useRef(new Set<string>());
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const reset = () => {
    if (timer.current) window.clearTimeout(timer.current);
    failed.current.clear();
    setWorkspaces(defaultLobbyWorkspaces);
    setInvitations(defaultLobbyInvitations);
    setActive("coldbrook");
    setNote(null);
    setRound((r) => r + 1);
  };

  const nameOf = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id;

  const surface = (
    <WorkspaceLobby
      key={round}
      workspaces={workspaces}
      invitations={invitations}
      now={defaultLobbyNow}
      value={active}
      onValueChange={(id) => {
        setActive(id);
        setNote(null);
      }}
      onSelect={async (workspace) => {
        setNote(`opening ${workspace.name}`);
        await wait(1600);
        if (
          workspace.id === "basinworks" &&
          !failed.current.has("basinworks")
        ) {
          failed.current.add("basinworks");
          setNote(`couldn’t open ${workspace.name}`);
          throw new Error("The Basinworks server didn’t answer. Try again.");
        }
        setNote(`${workspace.name} open`);
        if (!chrome) timer.current = window.setTimeout(reset, 2400);
      }}
      onCancel={(workspace) => setNote(`back from ${workspace.name}`)}
      onJoin={async (invitation) => {
        setNote(`joining ${invitation.name}`);
        await wait(700);
        setInvitations((list) => list.filter((i) => i.id !== invitation.id));
        setWorkspaces((list) => [
          ...list,
          {
            id: invitation.id,
            name: invitation.name,
            handle: invitation.handle,
            members: invitation.members + 1,
            people: [invitation.invitedBy],
            role: invitation.role,
            tint: invitation.tint,
            spaces: SPACES[invitation.id] ?? [],
          },
        ]);
        setNote(`joined ${invitation.name}`);
      }}
      onDecline={(invitation) => {
        setInvitations((list) => list.filter((i) => i.id !== invitation.id));
        setNote(`declined ${invitation.name}`);
      }}
      onCreate={() => setNote("create a workspace")}
      onSwitchAccount={() => setNote("switch account")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <>
            <span className="text-signal">{note}</span> · {workspaces.length}{" "}
            workspaces
          </>
        ) : (
          <>
            <span className="text-signal">{workspaces.length} workspaces</span>{" "}
            · {nameOf(active)} selected
          </>
        )}
      </p>
    </div>
  );
}
