"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultShareOrg,
  defaultSharePeople,
  SharePerimeter,
  type ShareLink,
  type SharePerson,
} from "@/registry/ui/share-perimeter";

export const tweaks = defineTweaks({
  ringStyle: {
    kind: "choice",
    label: "Ring",
    default: "line",
    options: ["line", "dash", "halo"],
    names: { line: "Line", dash: "Dash", halo: "Halo" },
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

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Mara Lindqvist sharing Coldbrook's river crossings plan. Invites to an
 * address outside Coldbrook take a moment to send, and one mistyped domain
 * refuses, so the inline error has something to say.
 */
export function SharePerimeterDemo({
  chrome = true,
  // The dialog is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [link, setLink] = React.useState<ShareLink>("invited");
  const [list, setList] = React.useState<SharePerson[]>(defaultSharePeople);
  const [open, setOpen] = React.useState(true);
  const [last, setLast] = React.useState<string | null>(null);

  const reset = () => {
    setLink("invited");
    setList(defaultSharePeople);
    setOpen(true);
    setLast(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <SharePerimeter
      key={round}
      onLinkChange={(l) => {
        setLink(l);
        setLast(null);
      }}
      onPeopleChange={setList}
      onOpenChange={setOpen}
      onInvite={async (person, role) => {
        setLast(`invited ${person.name} · ${role}`);
        if (person.email.endsWith("@coldbrook.co")) return;
        await wait(700);
        if (/@coldbrok\./.test(person.email)) {
          setLast(`invite to ${person.email} refused`);
          throw new Error(
            "coldbrok.co does not take mail. Check the spelling of the address.",
          );
        }
      }}
      onRoleChange={(person, role) => setLast(`${person.name} · ${role}`)}
      onRemove={(person) => setLast(`removed ${person.name}`)}
      onResend={async (person) => {
        await wait(500);
        setLast(`resent to ${person.email}`);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const active = list.filter((p) => p.status !== "pending");
  const outside = active.filter(
    (p) => !p.email.endsWith(`@${defaultShareOrg.domain}`),
  ).length;
  const reach =
    link === "invited"
      ? `${active.length} can open it`
      : link === "org"
        ? `${defaultShareOrg.size + outside} can open it`
        : "anyone with the link";
  const levelName =
    link === "invited"
      ? "invited only"
      : link === "org"
        ? `anyone at ${defaultShareOrg.name}`
        : "anyone with the link";
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
        {!open ? (
          <>
            <span className="text-signal">closed</span> · share to reopen
          </>
        ) : last ? (
          <>
            <span className="text-signal">{last}</span> · {levelName}
          </>
        ) : (
          <>
            <span className="text-signal">{levelName}</span> · {reach}
          </>
        )}
      </p>
    </div>
  );
}
