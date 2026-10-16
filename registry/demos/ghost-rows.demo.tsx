"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultGhostTemplates,
  GhostRows,
  type GhostImportState,
} from "@/registry/ui/ghost-rows";

export const tweaks = defineTweaks({
  ghostOpacity: {
    kind: "range",
    label: "Ghosts",
    default: 0.42,
    min: 0.2,
    max: 0.7,
    step: 0.02,
  },
  layout: {
    kind: "choice",
    label: "Layout",
    default: "split",
    options: ["split", "stack"],
    names: { split: "Split", stack: "Stack" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const TOTAL_ROWS = 1284;

/**
 * Fernworks sets up its first inventory table. Point at a template to watch
 * its rows pour in; choose it to keep them. Once the table is in view the
 * demo previews Spare parts by itself, like an onboarding hint, until the
 * visitor points at a way in. The demo buttons stand in for a real file: one
 * reads to the end, the other stops on a broken row.
 */
export function GhostRowsDemo({
  chrome = true,
  // The table is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<string | null>(null);
  const [importState, setImportState] = React.useState<GhostImportState | null>(
    null,
  );
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);
  const [hint, setHint] = React.useState<string | null>(null);
  const touched = React.useRef(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const timer = React.useRef<number | null>(null);

  // Once in view, the first time: Spare parts pours in as a hint, and the
  // visitor's own pointing takes over from it.
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let wait = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        wait = window.setTimeout(() => {
          if (!touched.current) setHint("spares");
        }, 700);
      },
      { threshold: 0.35 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearTimeout(wait);
    };
  }, [run]);
  const linking = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      if (linking.current) window.clearTimeout(linking.current);
    },
    [],
  );

  const simulate = (file: string, failAt: number | null) => {
    if (timer.current) window.clearInterval(timer.current);
    let progress = 0;
    setNote(null);
    setImportState({ phase: "reading", file, progress: 0, rows: 0 });
    timer.current = window.setInterval(() => {
      progress = Math.min(1, progress + 0.12);
      if (failAt !== null && progress >= failAt) {
        if (timer.current) window.clearInterval(timer.current);
        setImportState({
          phase: "failed",
          file,
          error:
            "Row 14 has 9 columns, but the header has 7. Check for a stray comma in the Part column, or export the sheet again as CSV.",
        });
        setNote(`import failed · ${file} · row 14`);
        return;
      }
      if (progress >= 1) {
        if (timer.current) window.clearInterval(timer.current);
        setImportState(null);
        setNote(`imported ${file} · 1,284 rows to review`);
        return;
      }
      setImportState({
        phase: "reading",
        file,
        progress,
        rows: Math.round(TOTAL_ROWS * progress),
      });
    }, 260);
  };

  const table = (
    <GhostRows
      key={run}
      value={value}
      onValueChange={(id) => {
        touched.current = true;
        setHint(null);
        setValue(id);
        if (!id) setNote(null);
      }}
      onTemplate={(t) =>
        setNote(
          `started from ${t.label.toLowerCase()} · ${t.rows.length} items`,
        )
      }
      onImport={(file) => simulate(file.name, null)}
      onConnect={(source) =>
        new Promise<void>((resolve) => {
          setNote(`connecting ${source.label.toLowerCase()}`);
          if (linking.current) window.clearTimeout(linking.current);
          linking.current = window.setTimeout(() => {
            setNote(
              `${source.label.toLowerCase()} connected · first sync running`,
            );
            resolve();
          }, 900);
        })
      }
      importState={importState}
      preview={hint}
      onPreviewChange={() => {
        touched.current = true;
        setHint(null);
      }}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full">
        {table}
      </div>
    );
  }

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const chosen = defaultGhostTemplates.find((t) => t.id === value);

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {table}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => simulate("fernworks-stock.csv", null)}
          className={button}
        >
          Import sample file
        </button>
        <button
          type="button"
          onClick={() => simulate("stock-count-oct.xlsx", 0.5)}
          className={button}
        >
          Import broken file
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current) window.clearInterval(timer.current);
            setValue(null);
            setImportState(null);
            setNote(null);
            setHint(null);
            touched.current = false;
            setRun((r) => r + 1);
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
        {importState?.phase === "reading" ? (
          <>
            <span className="text-signal">reading {importState.file}</span> ·{" "}
            {Math.round((importState.progress ?? 0) * 100)}%
          </>
        ) : note ? (
          <span className="text-signal">{note}</span>
        ) : chosen ? (
          <>
            <span className="text-signal">{chosen.label.toLowerCase()}</span> ·{" "}
            {chosen.rows.length} items
          </>
        ) : hint ? (
          <>
            <span className="text-signal">previewing spare parts</span> · 6
            ghost rows
          </>
        ) : (
          <>
            <span className="text-signal">empty</span> · point at a template to
            preview it
          </>
        )}
      </p>
    </div>
  );
}
