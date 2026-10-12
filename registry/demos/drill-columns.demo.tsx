"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultDrillFolders,
  defaultDrillLazyChildren,
  defaultDrillPath,
  DrillColumns,
  type DrillNode,
} from "@/registry/ui/drill-columns";

export const tweaks = defineTweaks({
  columnWidth: {
    kind: "range",
    label: "Columns",
    default: 200,
    min: 160,
    max: 260,
    step: 10,
    unit: "px",
  },
  iconStyle: {
    kind: "choice",
    label: "Icons",
    default: "tile",
    options: ["tile", "line", "label"],
    names: { tile: "Tile", line: "Line", label: "Label" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

/** The share's site photos live on a slow drive: they arrive after a beat. */
const loadFolder = (folder: DrillNode) =>
  new Promise<DrillNode[]>((resolve) => {
    window.setTimeout(
      () => resolve(defaultDrillLazyChildren[folder.id] ?? []),
      1100,
    );
  });

const names = (() => {
  const out = new Map<string, string>();
  const walk = (list: DrillNode[]) => {
    for (const node of list) {
      out.set(node.id, node.name);
      if (node.children) walk(node.children);
    }
  };
  walk(defaultDrillFolders);
  for (const list of Object.values(defaultDrillLazyChildren)) walk(list);
  return out;
})();

/** The root column, plus one per open folder (a previewed file adds none). */
const columnsOf = (path: string[]) => {
  const last = path[path.length - 1];
  const isFile = last ? (names.get(last) ?? "").includes(".") : false;
  return path.length + (isFile ? 0 : 1);
};

/**
 * Basinworks' project share: drawings by site, permits, a slow folder of site
 * photos, the programme and the handover notes.
 */
export function DrillColumnsDemo({
  chrome = true,
  // The browser is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [path, setPath] = React.useState<string[]>(defaultDrillPath);
  const [action, setAction] = React.useState<string | null>(null);
  const [generation, setGeneration] = React.useState(0);

  if (!chrome) {
    return (
      <div className="w-full">
        <DrillColumns
          className="h-[548px]"
          loadFolder={loadFolder}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <DrillColumns
        key={generation}
        className="h-[440px]"
        loadFolder={loadFolder}
        onPathChange={(next) => {
          setPath(next);
          setAction(null);
        }}
        onOpen={(file) => setAction(`opened ${file.name}`)}
        onMove={(item, folder) =>
          setAction(`moved ${item.name} to ${folder?.name ?? "Basinworks"}`)
        }
        onRename={(_, name) => setAction(`renamed to ${name}`)}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {action ? (
            <span className="text-signal">{action}</span>
          ) : (
            <>
              <span className="text-signal">
                {["Basinworks", ...path.map((id) => names.get(id) ?? id)].join(
                  " › ",
                )}
              </span>{" "}
              · {columnsOf(path)} {columnsOf(path) === 1 ? "column" : "columns"}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setPath(defaultDrillPath);
            setAction(null);
            setGeneration((g) => g + 1);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
    </div>
  );
}
