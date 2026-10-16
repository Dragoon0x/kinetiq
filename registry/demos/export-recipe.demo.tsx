"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultExportColumns,
  defaultExportFormats,
  defaultExportRanges,
  ExportRecipe,
} from "@/registry/ui/export-recipe";

export const tweaks = defineTweaks({
  glyphStyle: {
    kind: "choice",
    label: "Glyph",
    default: "paper",
    options: ["paper", "outline", "solid"],
    names: { paper: "Paper", outline: "Outline", solid: "Solid" },
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

const labelOf = (list: { id: string; label: string }[], id: string) =>
  (list.find((x) => x.id === id)?.label ?? id).toLowerCase();

/**
 * The Gaugeworks console exporting readings from the Harbour line's sixty
 * sensors. The demo paces each export; the first Quarter export times out at
 * 38% so the kept recipe and Try again can be seen.
 */
export function ExportRecipeDemo({
  chrome = true,
  // The dialog is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [format, setFormat] = React.useState("csv");
  const [range, setRange] = React.useState("7d");
  const [cols, setCols] = React.useState(defaultExportColumns.length);
  const [note, setNote] = React.useState<string | null>(null);
  const quarterFails = React.useRef(true);
  const timers = React.useRef(new Set<number>());
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearInterval(t);
      list.clear();
    };
  }, []);

  const dialog = (
    <ExportRecipe
      key={round}
      onFormatChange={(f) => {
        setFormat(f);
        setNote(null);
      }}
      onRangeChange={(r) => {
        setRange(r);
        setNote(null);
      }}
      onColumnsChange={(c) => {
        setCols(c.length);
        setNote(null);
      }}
      onExport={(recipe, report, signal) =>
        new Promise((resolve, reject) => {
          const fail = recipe.range === "q3" && quarterFails.current;
          if (fail) quarterFails.current = false;
          let p = 0;
          const t = window.setInterval(() => {
            p = Math.min(1, p + 0.035);
            if (fail && p >= 0.38) p = 0.38;
            report(p);
            setNote(`exporting · ${Math.round(p * 100)}%`);
            if (fail && p >= 0.38) {
              window.clearInterval(t);
              timers.current.delete(t);
              setNote("stopped at 38% · choices kept");
              reject(new Error("The query timed out after 30 seconds."));
            } else if (p >= 1) {
              window.clearInterval(t);
              timers.current.delete(t);
              setNote(`ready · ${recipe.fileName}`);
              resolve({
                name: recipe.fileName,
                bytes: Math.round(recipe.bytes * 1.013),
              });
            }
          }, 90);
          timers.current.add(t);
          signal.addEventListener("abort", () => {
            window.clearInterval(t);
            timers.current.delete(t);
          });
        })
      }
      onCancel={(during) =>
        setNote(during === "export" ? "cancelled · choices kept" : "closed")
      }
      onDownload={(file) => setNote(`downloaded · ${file.name}`)}
      onClose={() => setNote("emailed · closed")}
      className="mx-auto max-w-[44rem]"
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{dialog}</div>;

  const reset = () => {
    for (const t of timers.current) window.clearInterval(t);
    timers.current.clear();
    quarterFails.current = true;
    setFormat("csv");
    setRange("7d");
    setCols(defaultExportColumns.length);
    setNote(null);
    setRound((r) => r + 1);
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {dialog}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">
              {labelOf(defaultExportFormats, format)}
            </span>{" "}
            · {labelOf(defaultExportRanges, range)} · {cols} columns
          </>
        )}
      </p>
    </div>
  );
}
