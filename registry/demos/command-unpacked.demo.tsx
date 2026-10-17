"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CommandUnpacked,
  defaultCommand,
  type CommandPolicy,
} from "@/registry/ui/command-unpacked";

export const tweaks = defineTweaks({
  partStyle: {
    kind: "choice",
    label: "Parts",
    default: "chips",
    options: ["chips", "lines", "boxes"],
    names: { chips: "Chips", lines: "Lines", boxes: "Boxes" },
  },
  riskColor: {
    kind: "choice",
    label: "Risk",
    default: "var(--danger)",
    options: [
      "var(--danger)",
      "var(--warn)",
      "oklch(from var(--danger) l c 350)",
    ],
    names: {
      "var(--danger)": "Red",
      "var(--warn)": "Amber",
      "oklch(from var(--danger) l c 350)": "Rose",
    },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "oklch(from var(--accent-bright) l c 300)",
      "var(--signal)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "oklch(from var(--accent-bright) l c 300)": "Plum",
      "var(--signal)": "Mint",
    },
  },
});

type Scenario = "default" | "unknown" | "blocked";

const CASES: Record<
  Scenario,
  { command: string; policy: CommandPolicy | null; task: string }
> = {
  default: {
    command: defaultCommand,
    policy: null,
    task: "Clearing stale caches before a clean build",
  },
  unknown: {
    command: "wlx purge --all && wl build web",
    policy: null,
    task: "Purging the asset cache before a build",
  },
  blocked: {
    command: defaultCommand,
    policy: {
      blocked: true,
      reason: "Deletes outside the project need an admin to approve them.",
      source: "Waylight workspace policy",
    },
    task: "Clearing stale caches before a clean build",
  },
};

/**
 * Waylight's build agent wants to clear its caches before a clean build —
 * including one folder that isn't in this project.
 */
export function CommandUnpackedDemo({
  chrome = true,
  // The card is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [scenario, setScenario] = React.useState<Scenario>("default");
  const [round, setRound] = React.useState(0);
  const [line, setLine] = React.useState<string | null>(null);
  const c = CASES[scenario];

  const surface = (
    <CommandUnpacked
      key={`${scenario}-${round}`}
      command={c.command}
      policy={c.policy}
      agent={{ name: "Waylight build agent", task: c.task }}
      onApprove={() => setLine("approved · running in ~/waylight/web")}
      onDeny={() => setLine("denied · the agent was told")}
      onEditCommand={(next) =>
        setLine(`edited · ${next.slice(0, 32)}${next.length > 32 ? "…" : ""}`)
      }
      onAllowSimilar={(pattern) =>
        setLine(`allowed ${pattern} · this run still waits`)
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const waiting =
    scenario === "unknown"
      ? "waiting · unknown program wlx"
      : scenario === "blocked"
        ? "blocked by policy · deny or edit"
        : "waiting · 2 risks · rm -rf outside project";

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Waylight · web app · build agent approval
      </p>
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Scenario"
          className="flex flex-wrap items-center gap-1"
        >
          {(["default", "unknown", "blocked"] as Scenario[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scenario === s}
              onClick={() => {
                setScenario(s);
                setLine(null);
              }}
              className={cn(
                button,
                "px-2.5",
                scenario === s &&
                  "border-hairline-strong bg-surface-2 text-foreground",
              )}
            >
              {s === "default"
                ? "Caches"
                : s === "unknown"
                  ? "Unknown"
                  : "Blocked"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setLine(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line ?? waiting}</span>
        {" · waylight"}
      </p>
    </div>
  );
}
