"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BatchRunner,
  defaultBatchActions,
  defaultBatchItems,
  type BatchProgress,
} from "@/registry/ui/batch-runner";

export const tweaks = defineTweaks({
  cellShape: {
    kind: "choice",
    label: "Cells",
    default: "square",
    options: ["square", "round", "bar"],
    names: { square: "Square", round: "Round", bar: "Bar" },
  },
  cellSize: {
    kind: "range",
    label: "Cell size",
    default: 11,
    min: 6,
    max: 16,
    step: 1,
    unit: "px",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "moss", "graphite", "dusk"],
    names: {
      cobalt: "Cobalt",
      moss: "Moss",
      graphite: "Graphite",
      dusk: "Dusk",
    },
  },
});

type Note =
  | { kind: "idle" }
  | { kind: "running"; verb: string; retry: number; p: BatchProgress }
  | { kind: "paused"; p: BatchProgress }
  | { kind: "done"; verb: string; p: BatchProgress }
  | { kind: "stopped"; p: BatchProgress }
  | { kind: "cancelled" }
  | { kind: "closed" };

/** The inbox the dialog sits over: a quiet, inert frame. */
function InboxFrame() {
  const rows = defaultBatchItems.slice(0, 14);
  return (
    <div
      aria-hidden
      inert
      className="absolute inset-0 flex flex-col overflow-clip rounded-4 border border-hairline bg-card opacity-60"
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
        <span className="truncate text-[13px] font-semibold">
          Coldbrook Support · Open
        </span>
        <span className="shrink-0 rounded-full bg-cobalt-wash px-2 py-0.5 font-mono text-[11px] text-cobalt-bright">
          248 selected
        </span>
      </div>
      {rows.map((item) => (
        <div
          key={item.id}
          className="flex h-11 shrink-0 items-center gap-3 border-b border-hairline px-4"
        >
          <span className="size-3.5 shrink-0 rounded-1 border border-primary bg-primary" />
          <span className="w-24 shrink-0 truncate text-[12px] font-medium">
            {item.label}
          </span>
          <span className="min-w-0 truncate text-[12px] text-ink-3">
            {item.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Coldbrook Support has 248 open conversations selected. The dialog confirms
 * the scope and archives them where you can watch; three fail the first pass
 * (two time out, one is under a legal hold) and Retry failed reruns only those.
 */
export function BatchRunnerDemo({
  chrome = true,
  // The dialog is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [action, setAction] = React.useState("archive");
  const [note, setNote] = React.useState<Note>({ kind: "idle" });
  const verbOf = (id: string, form: "past" | "progressive") =>
    (defaultBatchActions.find((a) => a.id === id)?.[form] ?? id).toLowerCase();

  const dialog = (
    <BatchRunner
      key={round}
      action={action}
      onActionChange={setAction}
      autoStart={!chrome}
      onRun={({ ids }) =>
        setNote({
          kind: "running",
          verb: verbOf(action, "progressive"),
          retry: 0,
          p: { done: 0, failed: 0, left: ids.length },
        })
      }
      onRetry={(ids) =>
        setNote((n) => ({
          kind: "running",
          verb: "retrying",
          retry: ids.length,
          p: n.kind === "done" ? n.p : { done: 0, failed: 0, left: 0 },
        }))
      }
      onProgress={(p) =>
        setNote((n) => (n.kind === "running" ? { ...n, p } : n))
      }
      onPauseChange={(paused) =>
        setNote((n) =>
          paused && n.kind === "running"
            ? { kind: "paused", p: n.p }
            : !paused && n.kind === "paused"
              ? {
                  kind: "running",
                  verb: verbOf(action, "progressive"),
                  retry: 0,
                  p: n.p,
                }
              : n,
        )
      }
      onCancel={(p) =>
        setNote(
          p.done + p.failed === 0
            ? { kind: "cancelled" }
            : { kind: "stopped", p },
        )
      }
      onComplete={(s) =>
        setNote((n) =>
          n.kind === "stopped"
            ? n
            : {
                kind: "done",
                verb: verbOf(s.action, "past"),
                p: { done: s.done, failed: s.failed, left: s.skipped },
              },
        )
      }
      onClose={() => setNote({ kind: "closed" })}
      className="w-full max-w-[36rem]"
      {...values}
    />
  );

  const scene = (
    <div className="relative w-full">
      <InboxFrame />
      <div className="relative flex w-full justify-center p-3 @min-[30rem]:p-6">
        {dialog}
      </div>
    </div>
  );

  if (!chrome) return <div className="@container w-full">{scene}</div>;

  const reset = () => {
    setNote({ kind: "idle" });
    setAction("archive");
    setRound((r) => r + 1);
  };

  const line = (() => {
    switch (note.kind) {
      case "idle":
        return (
          <>
            <span className="text-signal">248 selected</span> · confirm to run
          </>
        );
      case "running":
        return note.retry > 0 ? (
          <>
            <span className="text-signal">retrying {note.retry}</span> ·{" "}
            {note.p.done} {verbOf(action, "past")} so far
          </>
        ) : (
          <>
            <span className="text-signal">{note.verb}</span> ·{" "}
            {note.p.done + note.p.failed} of 248
          </>
        );
      case "paused":
        return (
          <>
            <span className="text-signal">paused</span> at{" "}
            {note.p.done + note.p.failed} of 248
          </>
        );
      case "done":
        return (
          <>
            <span className="text-signal">
              {note.p.done} {note.verb}
            </span>
            {note.p.failed > 0
              ? ` · ${note.p.failed} failed`
              : " · none failed"}
          </>
        );
      case "stopped":
        return (
          <>
            <span className="text-signal">stopped</span> · {note.p.left} left as
            they were
          </>
        );
      case "cancelled":
        return (
          <>
            <span className="text-signal">cancelled</span> · nothing changed
          </>
        );
      default:
        return (
          <>
            <span className="text-signal">closed</span> · reset to run again
          </>
        );
    }
  })();

  return (
    <div className="@container flex w-full max-w-3xl flex-col gap-4">
      {scene}
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
        {line}
      </p>
    </div>
  );
}
