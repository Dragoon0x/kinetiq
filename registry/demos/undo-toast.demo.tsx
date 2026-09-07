"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { exitFor, safe, springs } from "@/registry/lib/motion";
import { UndoToast } from "@/registry/ui/undo-toast";

type Row = { id: string; from: string; subject: string };

const ROWS: Row[] = [
  { id: "r1", from: "Waylight ops", subject: "Bench 4 recalibrated" },
  { id: "r2", from: "Fieldline", subject: "Weekly digest" },
  { id: "r3", from: "Gaugeworks", subject: "Sensor 12 drifting" },
  { id: "r4", from: "Basinworks", subject: "Invoice 4471" },
];

export function UndoToastDemo() {
  const motionSafe = useMotionSafe();
  const [rows, setRows] = React.useState(ROWS);
  const [pending, setPending] = React.useState<{
    row: Row;
    index: number;
  } | null>(null);

  const archive = (id: string) => {
    const index = rows.findIndex((row) => row.id === id);
    const row = rows[index];
    if (!row) return;
    setPending({ row, index });
    setRows((previous) => previous.filter((entry) => entry.id !== id));
  };

  const restore = () => {
    if (!pending) return;
    setRows((previous) => {
      const next = previous.slice();
      next.splice(Math.min(pending.index, next.length), 0, pending.row);
      return next;
    });
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative overflow-hidden rounded-3 border border-hairline bg-surface-1">
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <span>Coldbrook inbox</span>
          <span className="tabular-nums">{rows.length}</span>
        </div>

        <ul>
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.li
                key={row.id}
                className="overflow-hidden border-b border-hairline last:border-b-0"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0, transition: exitFor() }}
                transition={safe(springs.glide)(motionSafe)}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      title={row.subject}
                    >
                      {row.subject}
                    </p>
                    <p className="truncate text-xs text-ink-3">{row.from}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => archive(row.id)}
                    className="flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Archive
                  </button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
          {rows.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-ink-3">
              Nothing left in the inbox.
            </li>
          ) : null}
        </ul>

        <UndoToast
          open={pending !== null}
          message={pending ? `Archived ${pending.row.subject}` : ""}
          onAction={restore}
          onDismiss={() => setPending(null)}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Inbox <span className="text-signal tabular-nums">{rows.length}</span> of{" "}
        <span className="tabular-nums">{ROWS.length}</span>
        {pending ? " · undo window open" : ""}
      </p>
    </div>
  );
}
