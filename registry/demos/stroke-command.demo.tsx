"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  StrokeCommand,
  type StrokeCommandItem,
  type StrokeShape,
} from "@/registry/ui/stroke-command";
import { cn } from "@/registry/lib/utils";

export const tweaks = defineTweaks({
  tolerance: {
    kind: "range",
    label: "Tolerance",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  trail: { kind: "toggle", label: "Trail", default: true },
  width: {
    kind: "range",
    label: "Width",
    default: 4,
    min: 2,
    max: 10,
    step: 1,
    unit: "px",
  },
  templates: {
    kind: "choice",
    label: "Templates",
    default: "ghost",
    options: ["ghost", "off"],
    names: { ghost: "Ghost", off: "Off" },
  },
});

const COMMANDS: StrokeCommandItem[] = [
  { shape: "check", label: "Done" },
  { shape: "circle", label: "Pin" },
  { shape: "arrow", label: "Send" },
  { shape: "zigzag", label: "Delete" },
];

type State = "open" | "done" | "pinned" | "sent" | "deleted";

const AFTER: Record<StrokeShape, State> = {
  check: "done",
  circle: "pinned",
  arrow: "sent",
  zigzag: "deleted",
};

const BADGE: Record<State, string> = {
  open: "Open",
  done: "Done",
  pinned: "Pinned",
  sent: "Sent",
  deleted: "Deleted",
};

type Last =
  | { kind: "run"; label: string; shape: StrokeShape; score: number }
  | {
      kind: "miss";
      shape: StrokeShape | null;
      score: number;
      needs: number;
    }
  | null;

/**
 * A Fieldline task, run by drawing: a check marks it done, a circle pins it,
 * an arrow sends it to Basinworks and a zigzag deletes it. The chips do the
 * same from the keyboard.
 */
export function StrokeCommandDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<State>("open");
  const [last, setLast] = React.useState<Last>(null);

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <div className="flex h-5 items-center justify-between gap-3">
        <p
          className={cn(
            "min-w-0 truncate text-sm text-foreground",
            (state === "done" || state === "deleted") &&
              "text-ink-3 line-through",
          )}
          title="Invoice 2291 to Basinworks"
        >
          Invoice 2291 to Basinworks
        </p>
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-center rounded-full px-2 font-mono text-[10px] tracking-[0.06em] uppercase",
            state === "open"
              ? "bg-surface-2 text-ink-2"
              : state === "deleted"
                ? "bg-surface-2 text-danger"
                : "bg-cobalt-wash text-cobalt-bright",
          )}
        >
          {BADGE[state]}
        </span>
      </div>
      <StrokeCommand
        label="Task commands"
        commands={COMMANDS}
        height={chrome ? 180 : 150}
        onCommand={(run) => {
          setState(AFTER[run.shape]);
          setLast({
            kind: "run",
            label: run.label,
            shape: run.shape,
            score: run.score,
          });
        }}
        onMiss={(best, threshold) =>
          setLast({
            kind: "miss",
            shape: best?.shape ?? null,
            score: best?.score ?? 0,
            needs: threshold,
          })
        }
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="mt-2 border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {last === null ? (
            <>
              <span className="text-signal">draw a shape</span> ·{" "}
              {COMMANDS.length} commands
            </>
          ) : last.kind === "run" ? (
            <>
              <span className="text-signal">{last.label}</span> · {last.shape}{" "}
              {Math.round(last.score * 100)}%
            </>
          ) : last.shape ? (
            <>
              <span className="text-signal">no match</span> · best {last.shape}{" "}
              {Math.round(last.score * 100)}%, needs{" "}
              {Math.round(last.needs * 100)}%
            </>
          ) : (
            <>
              <span className="text-signal">no match</span> · not a shape
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
