"use client";

import * as React from "react";

import {
  Activity,
  Archive,
  FileDown,
  Moon,
  Play,
  UserPlus,
} from "lucide-react";

import {
  CommandDeck,
  type DeckCommand,
} from "@/registry/blocks/command-deck/command-deck";

export function CommandDeckDemo() {
  const [lastRun, setLastRun] = React.useState<string | null>(null);
  // "Toggle dark mode" flips demo-local state only — never the real theme.
  const [demoDark, setDemoDark] = React.useState(false);

  const commands = React.useMemo<DeckCommand[]>(() => {
    const exec = (label: string) => () => setLastRun(label);
    return [
      {
        id: "run-calibration",
        label: "Run calibration",
        section: "Actions",
        hint: "⌘R",
        icon: <Play />,
        keywords: ["bench", "tune", "zero"],
        run: exec("Run calibration"),
      },
      {
        id: "open-telemetry",
        label: "Open telemetry",
        section: "Actions",
        icon: <Activity />,
        keywords: ["metrics", "graphs", "scope"],
        run: exec("Open telemetry"),
      },
      {
        id: "export-report",
        label: "Export bench report",
        section: "Actions",
        hint: "⌘E",
        icon: <FileDown />,
        keywords: ["pdf", "download", "save"],
        run: exec("Export bench report"),
      },
      {
        id: "toggle-dark",
        label: "Toggle dark mode",
        section: "Preferences",
        icon: <Moon />,
        keywords: ["theme", "appearance", "light"],
        run: () => {
          setDemoDark((previous) => !previous);
          setLastRun("Toggle dark mode");
        },
      },
      {
        id: "invite-operator",
        label: "Invite operator…",
        section: "People",
        icon: <UserPlus />,
        keywords: ["team", "member", "add"],
        run: exec("Invite operator…"),
      },
      {
        id: "archive-rig",
        label: "Archive rig",
        section: "Danger zone",
        icon: <Archive />,
        keywords: ["delete", "remove", "retire"],
        destructive: true,
        run: exec("Archive rig"),
      },
    ];
  }, []);

  return (
    <div className="relative w-full max-w-md">
      <CommandDeck
        inline
        commands={commands}
        placeholder="Type a command…"
        recentKey="kinetiq-demo-deck-recents"
      />
      <div className="mt-3 flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.08em] uppercase">
        <span
          className={
            lastRun ? "text-[var(--signal,var(--primary))]" : "text-muted-foreground"
          }
        >
          {lastRun ? `Executed · ${lastRun}` : "Standing by"}
        </span>
        <span className="text-muted-foreground">
          Demo theme · {demoDark ? "Dark" : "Light"}
        </span>
      </div>
    </div>
  );
}
