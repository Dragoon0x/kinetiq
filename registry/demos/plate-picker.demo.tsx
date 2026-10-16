"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultPlateAssets, PlatePicker } from "@/registry/ui/plate-picker";

export const tweaks = defineTweaks({
  columns: {
    kind: "range",
    label: "Columns",
    default: 4,
    min: 3,
    max: 6,
    step: 1,
  },
  badgeStyle: {
    kind: "choice",
    label: "Badge",
    default: "disc",
    options: ["disc", "tab", "frame"],
    names: { disc: "Disc", tab: "Tab", frame: "Frame" },
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

const START = ["salt-flat", "kelp-bed", "lighthouse"];
const LIMIT = 20 * 1024 * 1024;
const nameOf = (id: string) =>
  (
    defaultPlateAssets.find((a) => a.id === id)?.name ?? "your upload"
  ).toLowerCase();

/**
 * Fieldline's picture desk choosing the plates for the opening spread of
 * issue 14, "Tidelines". Uploads are paced by the demo and refused over 20 MB,
 * so a large file shows the marked tile with Retry and Remove.
 */
export function PlatePickerDemo({
  chrome = true,
  // The picker is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [order, setOrder] = React.useState<string[]>(START);
  const [note, setNote] = React.useState<string | null>(null);
  const last = React.useRef<string[]>(START);
  const timers = React.useRef(new Set<number>());
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearInterval(t);
      list.clear();
    };
  }, []);

  const picker = (
    <PlatePicker
      key={round}
      defaultSelected={START}
      onSelect={(ids) => {
        const prev = last.current;
        last.current = ids;
        const same =
          prev.length === ids.length && prev.every((id) => ids.includes(id));
        const first = ids[0];
        setOrder(ids);
        setNote(same && first ? `reordered · ${nameOf(first)} first` : null);
      }}
      onUpload={(file, report) =>
        new Promise<void>((resolve, reject) => {
          if (file.size > LIMIT) {
            const t = window.setInterval(() => {
              window.clearInterval(t);
              timers.current.delete(t);
              setNote(`refused ${file.name.toLowerCase()} · over 20 mb`);
              reject(new Error("The file is over 20 MB"));
            }, 700);
            timers.current.add(t);
            return;
          }
          let p = 0;
          const t = window.setInterval(() => {
            p = Math.min(1, p + 0.07 + (file.size % 7) * 0.006);
            report(p);
            setNote(`uploading · ${Math.round(p * 100)}%`);
            if (p >= 1) {
              window.clearInterval(t);
              timers.current.delete(t);
              setNote(`uploaded ${file.name.toLowerCase()}`);
              resolve();
            }
          }, 140);
          timers.current.add(t);
        })
      }
      onInsert={(assets) =>
        setNote(
          `inserted ${assets.length} ${assets.length === 1 ? "plate" : "plates"}`,
        )
      }
      onCancel={() => setNote("cancelled · nothing inserted")}
      className="mx-auto max-w-[48rem]"
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{picker}</div>;

  const reset = () => {
    for (const t of timers.current) window.clearInterval(t);
    timers.current.clear();
    setOrder(START);
    last.current = START;
    setNote(null);
    setRound((r) => r + 1);
  };
  const first = order[0];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {picker}
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
        ) : order.length === 0 ? (
          <>
            <span className="text-signal">nothing chosen</span> · pick in the
            order they run
          </>
        ) : (
          <>
            <span className="text-signal">{order.length} chosen</span>
            {first ? ` · ${nameOf(first)} first` : null}
          </>
        )}
      </p>
    </div>
  );
}
