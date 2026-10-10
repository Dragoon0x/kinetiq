"use client";

import * as React from "react";

import {
  Hand,
  MessageSquare,
  MousePointer2,
  PenTool,
  Square,
  Type,
} from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { EmberTip, EmberTipTrigger } from "@/registry/ui/ember-tip";

export const tweaks = defineTweaks({
  delay: {
    kind: "range",
    label: "Delay",
    default: 600,
    min: 0,
    max: 1200,
    step: 50,
    unit: "ms",
  },
  warm: {
    kind: "range",
    label: "Warm",
    default: 1500,
    min: 0,
    max: 4000,
    step: 250,
    unit: "ms",
  },
  placement: {
    kind: "choice",
    label: "Placement",
    default: "top",
    options: ["top", "bottom"],
    names: { top: "Top", bottom: "Bottom" },
  },
});

const TOOLS = [
  { id: "select", name: "Select", key: "V", Icon: MousePointer2 },
  { id: "pan", name: "Pan", key: "H", Icon: Hand },
  { id: "pen", name: "Pen", key: "P", Icon: PenTool },
  { id: "rect", name: "Rectangle", key: "R", Icon: Square },
  { id: "text", name: "Text", key: "T", Icon: Type },
  { id: "comment", name: "Comment", key: "C", Icon: MessageSquare },
] as const;

/**
 * A Fernworks Sketch board: its tool dock's tips wait the first time, then
 * slide from tool to tool while you look around, and cool off when you stop.
 */
export function EmberTipDemo({
  chrome = true,
  // Tips are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tool, setTool] = React.useState<string>("pen");
  const [focus, setFocus] = React.useState(2);
  const [warm, setWarm] = React.useState(false);
  const [last, setLast] = React.useState<string | null>(null);
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const below = values.placement === "bottom";

  const move = (to: number) => {
    const n = TOOLS.length;
    const i = (to + n) % n;
    setFocus(i);
    buttons.current[i]?.focus();
  };

  const board = (
    <div className="relative h-44 w-full max-w-md self-center overflow-clip rounded-3 border border-hairline bg-card bg-[radial-gradient(var(--hairline-strong)_1px,transparent_1px)] bg-size-[16px_16px]">
      <svg
        aria-hidden
        viewBox="0 0 400 176"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 size-full"
      >
        <rect
          x={below ? 54 : 46}
          y={below ? 78 : 26}
          width={118}
          height={70}
          rx={10}
          fill="none"
          strokeWidth={1.5}
          className="stroke-ink-3/60"
        />
        <circle
          cx={below ? 300 : 292}
          cy={below ? 118 : 62}
          r={30}
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          className="stroke-cobalt-bright/70"
        />
        <path
          d={
            below
              ? "M190 150 C 214 118, 238 160, 262 128"
              : "M180 92 C 204 60, 228 102, 252 70"
          }
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          className="stroke-ink-2/70"
        />
      </svg>
      <div
        className={cn(
          "absolute inset-x-0 flex justify-center px-3",
          below ? "top-3" : "bottom-3",
        )}
      >
        <EmberTip
          role="toolbar"
          aria-label="Tools"
          className="flex items-center gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1"
          onOpenChange={(id) => {
            if (id) setLast(TOOLS.find((t) => t.id === id)?.name ?? null);
          }}
          onWarmChange={setWarm}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") move(focus + 1);
            else if (event.key === "ArrowLeft") move(focus - 1);
            else if (event.key === "Home") move(0);
            else if (event.key === "End") move(TOOLS.length - 1);
            else return;
            event.preventDefault();
          }}
          {...values}
        >
          {TOOLS.map(({ id, name, key, Icon }, i) => (
            <EmberTipTrigger
              key={id}
              id={id}
              content={
                <span className="flex items-center gap-2 whitespace-nowrap">
                  {name}
                  <kbd className="rounded-1 border border-hairline px-1 font-mono text-[10px] leading-4 text-ink-3">
                    {key}
                  </kbd>
                </span>
              }
            >
              <button
                ref={(node) => {
                  buttons.current[i] = node;
                }}
                type="button"
                aria-label={name}
                aria-pressed={tool === id}
                tabIndex={i === focus ? 0 : -1}
                onClick={() => {
                  setTool(id);
                  setFocus(i);
                }}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-2 transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  tool === id
                    ? "bg-cobalt-wash text-cobalt-bright"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
              </button>
            </EmberTipTrigger>
          ))}
        </EmberTip>
      </div>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{board}</div>;
  }

  const delay = values.delay ?? 600;
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {board}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{warm ? "warm" : "cold"}</span>
        {warm
          ? ` · ${last ? last.toLowerCase() : "tips"} · tips slide`
          : ` · first tip waits ${delay} ms`}
      </p>
    </div>
  );
}
