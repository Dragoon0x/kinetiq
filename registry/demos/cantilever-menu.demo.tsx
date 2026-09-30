"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CantileverMenu,
  type CantileverGroup,
} from "@/registry/ui/cantilever-menu";

export const tweaks = defineTweaks({
  trays: {
    kind: "range",
    label: "Trays",
    default: 3,
    min: 2,
    max: 3,
    step: 1,
  },
  arms: {
    kind: "range",
    label: "Arms",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "red",
    options: ["red", "steel", "green"],
    names: { red: "Red", steel: "Steel", green: "Green" },
  },
});

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      {children}
    </svg>
  );
}

const TOOLBOX: CantileverGroup[] = [
  {
    id: "edit",
    label: "Edit",
    actions: [
      {
        id: "cut",
        label: "Cut",
        shortcut: "⌘X",
        icon: (
          <Icon>
            <circle cx={4.5} cy={11.5} r={2} />
            <circle cx={11.5} cy={11.5} r={2} />
            <path d="M6 10 12 2.5M10 10 4 2.5" />
          </Icon>
        ),
      },
      {
        id: "copy",
        label: "Copy",
        shortcut: "⌘C",
        icon: (
          <Icon>
            <rect x={5.5} y={5.5} width={8} height={8} rx={1.5} />
            <path d="M3.5 10.5h-1v-8h8v1" />
          </Icon>
        ),
      },
      {
        id: "paste",
        label: "Paste",
        shortcut: "⌘V",
        icon: (
          <Icon>
            <rect x={3} y={3} width={10} height={11} rx={1.5} />
            <path d="M6 3V2h4v1M5.5 7.5h5M5.5 10.5h3" />
          </Icon>
        ),
      },
      {
        id: "duplicate",
        label: "Duplicate",
        shortcut: "⌘D",
        icon: (
          <Icon>
            <rect x={2.5} y={2.5} width={11} height={11} rx={2} />
            <path d="M8 5.5v5M5.5 8h5" />
          </Icon>
        ),
      },
    ],
  },
  {
    id: "arrange",
    label: "Arrange",
    actions: [
      {
        id: "forward",
        label: "Bring forward",
        icon: (
          <Icon>
            <path d="M8 13V3M4.5 6.5 8 3l3.5 3.5M3 13.5h10" />
          </Icon>
        ),
      },
      {
        id: "backward",
        label: "Send backward",
        icon: (
          <Icon>
            <path d="M8 3v10M4.5 9.5 8 13l3.5-3.5M3 2.5h10" />
          </Icon>
        ),
      },
      {
        id: "group",
        label: "Group",
        shortcut: "⌘G",
        icon: (
          <Icon>
            <rect
              x={2}
              y={2}
              width={12}
              height={12}
              rx={1.5}
              strokeDasharray="2 2"
            />
            <rect x={5} y={5} width={6} height={6} rx={1} />
          </Icon>
        ),
      },
      {
        id: "align",
        label: "Align left",
        icon: (
          <Icon>
            <path d="M2.5 2v12M5 5h8M5 11h5" />
          </Icon>
        ),
      },
    ],
  },
  {
    id: "object",
    label: "Object",
    actions: [
      {
        id: "rotate",
        label: "Rotate",
        icon: (
          <Icon>
            <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" />
          </Icon>
        ),
      },
      {
        id: "flip",
        label: "Flip",
        icon: (
          <Icon>
            <path d="M8 2v12M6 4.5 2.5 12H6zM10 4.5l3.5 7.5H10z" />
          </Icon>
        ),
      },
      {
        id: "lock",
        label: "Lock",
        shortcut: "⌘L",
        icon: (
          <Icon>
            <rect x={3} y={7} width={10} height={7} rx={1.5} />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </Icon>
        ),
      },
      {
        id: "delete",
        label: "Delete",
        tone: "danger",
        icon: (
          <Icon>
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
          </Icon>
        ),
      },
    ],
  },
];

const LABELS = new Map(
  TOOLBOX.flatMap((g) => g.actions.map((a) => [a.id, a.label] as const)),
);
const TOTAL = TOOLBOX.reduce((sum, g) => sum + g.actions.length, 0);

/**
 * The object toolbox in Fieldline Sketch: three trays of tools for the shape
 * selected on the canvas, the route map.
 */
export function CantileverMenuDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [last, setLast] = React.useState<string | null>(null);
  const [copies, setCopies] = React.useState(1);
  const trays = Math.round(values.trays ?? 3);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <CantileverMenu
        label="Object tools"
        groups={TOOLBOX}
        open={open}
        onOpenChange={setOpen}
        onAction={(id) => {
          setLast(id);
          if (id === "duplicate") setCopies((c) => c + 1);
        }}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {open ? (
            <>
              <span className="text-signal">open</span> · {TOTAL} tools
            </>
          ) : last ? (
            <>
              <span className="text-signal">{LABELS.get(last)}</span> ·{" "}
              {copies === 1
                ? "the route map"
                : `${copies} copies of the route map`}
            </>
          ) : (
            <>
              <span className="text-signal">
                {trays} {trays === 1 ? "tray" : "trays"} shut
              </span>{" "}
              · press the latch
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
