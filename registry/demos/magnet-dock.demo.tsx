"use client";

import * as React from "react";

import {
  Activity,
  Database,
  FileText,
  GitBranch,
  Settings,
  Terminal,
} from "lucide-react";

import { MagnetDock, type DockItem } from "@/registry/ui/magnet-dock";

const APPS = [
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "files", label: "Files", icon: FileText },
  { id: "branches", label: "Branches", icon: GitBranch },
  { id: "database", label: "Database", icon: Database },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

export function MagnetDockDemo() {
  const [activeId, setActiveId] = React.useState<string>("terminal");

  const items: DockItem[] = APPS.map(({ id, label, icon: Icon }) => ({
    id,
    label,
    icon: <Icon className="size-4" />,
    active: id === activeId,
    onSelect: () => setActiveId(id),
  }));

  const activeLabel = APPS.find((app) => app.id === activeId)?.label ?? "None";

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-5 pt-14">
      <MagnetDock items={items} reorderable label="App dock" />
      <p
        role="status"
        className="text-muted-foreground font-mono text-xs tracking-wide uppercase tabular-nums"
      >
        Foreground · {activeLabel}
      </p>
      <p className="text-muted-foreground text-xs">
        Drag to reorder · Space lifts with keyboard
      </p>
    </div>
  );
}
