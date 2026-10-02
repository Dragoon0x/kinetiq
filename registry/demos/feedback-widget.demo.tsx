"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  emptyFeedback,
  FeedbackWidget,
  feedbackScales,
  type FeedbackDraft,
} from "@/registry/ui/feedback-widget";

export const tweaks = defineTweaks({
  faces: {
    kind: "choice",
    label: "Faces",
    default: "five",
    options: ["five", "three", "two"],
    names: { five: "Five", three: "Three", two: "Two" },
  },
  dock: {
    kind: "choice",
    label: "Dock",
    default: "right",
    options: ["right", "left", "bottom"],
    names: { right: "Right", left: "Left", bottom: "Bottom" },
  },
  steps: {
    kind: "choice",
    label: "Steps",
    default: "guided",
    options: ["guided", "single", "quick"],
    names: { guided: "Guided", single: "Single", quick: "Quick" },
  },
});

const STOPS = [
  { name: "Coldbrook depot", eta: "08:10", tone: "bg-cobalt-bright" },
  { name: "Basinworks yard", eta: "09:25", tone: "bg-ink-3" },
  { name: "Waylight market", eta: "10:40", tone: "bg-ink-3" },
];

/** Fieldline's route planner: the page the widget docks to. */
function RoutePlanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-4">
        <span aria-hidden className="size-2.5 rounded-full bg-cobalt-bright" />
        <span className="text-[13px] font-semibold">Fieldline</span>
        <span className="text-[13px] text-ink-3">/ Route planner</span>
        <span className="ml-auto rounded-full bg-cobalt-wash px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] text-cobalt-bright uppercase">
          New
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-clip p-4 pr-12">
        <div className="relative h-36 shrink-0 overflow-clip rounded-3 border border-hairline bg-surface-1">
          <svg
            aria-hidden
            viewBox="0 0 300 140"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 size-full"
          >
            {[20, 50, 80, 110].map((y) => (
              <line
                key={y}
                x1={0}
                x2={300}
                y1={y}
                y2={y}
                className="stroke-hairline"
              />
            ))}
            {[40, 100, 160, 220, 280].map((x) => (
              <line
                key={x}
                x1={x}
                x2={x}
                y1={0}
                y2={140}
                className="stroke-hairline"
              />
            ))}
            <path
              d="M40 110 C 80 100, 90 60, 130 62 S 200 92, 240 40"
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              className="stroke-cobalt-bright"
            />
            {[
              [40, 110],
              [130, 62],
              [240, 40],
            ].map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={5}
                strokeWidth={2}
                className="fill-background stroke-cobalt-bright"
              />
            ))}
          </svg>
          <span className="absolute bottom-2 left-2 rounded-1 bg-background/90 px-1.5 py-0.5 font-mono text-[10px] text-ink-2 tabular-nums">
            3 stops · 42 km
          </span>
        </div>
        <ol className="flex flex-col gap-1.5">
          {STOPS.map((stop, i) => (
            <li
              key={stop.name}
              className="flex h-10 items-center gap-3 rounded-2 border border-hairline bg-card px-3"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] text-primary-foreground",
                  stop.tone,
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {stop.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                {stop.eta}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-[12px] text-ink-3">
          Drag stops to reorder. Times update as the route changes.
        </p>
      </div>
    </div>
  );
}

/**
 * Fieldline's new route planner, with the feedback widget docked to its
 * edge and open. Sending answers after 700 ms.
 */
export function FeedbackWidgetDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(true);
  const [draft, setDraft] = React.useState<FeedbackDraft>(emptyFeedback);
  const [note, setNote] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);

  const scale = feedbackScales[values.faces ?? "five"];
  const nameOf = (r: number | null) =>
    r === null ? "" : (scale[r - 1]?.label ?? "").toLowerCase();

  const widget = (
    <FeedbackWidget
      key={round}
      title="How's the new route planner?"
      open={open}
      onOpenChange={setOpen}
      onValueChange={(next) => {
        if (next.rating !== draft.rating && next.rating !== null) {
          setNote(`rating · ${nameOf(next.rating)}`);
        } else if (next.screenshot && !draft.screenshot) {
          setNote("screenshot attached");
        }
        setDraft(next);
      }}
      onSubmit={(feedback) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          setFailNext(false);
          setNote("sending");
          window.setTimeout(() => {
            if (fail) {
              setNote("send failed · try again");
              reject(new Error("Fieldline didn't get that. Try again."));
              return;
            }
            setNote(
              `sent · ${nameOf(feedback.rating)}${feedback.screenshot ? " · with screenshot" : ""}`,
            );
            resolve();
          }, 700);
        })
      }
      sound={sound}
      {...values}
    >
      <RoutePlanner className={chrome ? "h-[500px]" : "h-[540px]"} />
    </FeedbackWidget>
  );

  if (!chrome) return <div className="w-full">{widget}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {widget}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {open ? "panel open" : "docked"}
              </span>{" "}
              · {open ? "pick a face" : "press the tab"}
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              const next = !failRef.current;
              failRef.current = next;
              setFailNext(next);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger/50 aria-pressed:text-danger"
          >
            Fail next
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setDraft(emptyFeedback);
              setNote(null);
              failRef.current = false;
              setFailNext(false);
              setRound((r) => r + 1);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
