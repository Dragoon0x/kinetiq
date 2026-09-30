"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ToolDock, type ToolDockTool } from "@/registry/ui/tool-dock";

export const tweaks = defineTweaks({
  orientation: {
    kind: "choice",
    label: "Orientation",
    default: "vertical",
    options: ["vertical", "horizontal"],
    names: { vertical: "Vertical", horizontal: "Horizontal" },
  },
  shortcuts: { kind: "toggle", label: "Shortcuts", default: true },
  flyout: {
    kind: "choice",
    label: "Options",
    default: "side",
    options: ["side", "tray"],
    names: { side: "Side", tray: "Tray" },
  },
  labels: { kind: "toggle", label: "Labels", default: false },
});

const TOOLS: ToolDockTool[] = [
  { id: "move", label: "Move", glyph: "move", key: "v" },
  { id: "hand", label: "Hand", glyph: "hand", key: "h" },
  { id: "frame", label: "Frame", glyph: "frame", key: "f" },
  {
    id: "shape",
    label: "Shape",
    variants: [
      { id: "rect", label: "Rectangle", glyph: "rect", key: "r" },
      { id: "ellipse", label: "Ellipse", glyph: "ellipse", key: "o" },
      { id: "line", label: "Line", glyph: "line", key: "l" },
      { id: "polygon", label: "Polygon", glyph: "polygon" },
    ],
  },
  {
    id: "draw",
    label: "Pen",
    variants: [
      { id: "pen", label: "Pen", glyph: "pen", key: "p" },
      { id: "pencil", label: "Pencil", glyph: "pencil" },
      { id: "brush", label: "Brush", glyph: "brush", key: "b" },
    ],
  },
  { id: "text", label: "Text", glyph: "text", key: "t" },
];

const describe = (id: string) => {
  for (const tool of TOOLS) {
    if (tool.id === id) return { name: tool.label, key: tool.key ?? null };
    for (const v of tool.variants ?? []) {
      if (v.id === id)
        return { name: v.label, key: v.key ?? null, group: tool };
    }
  }
  return { name: id, key: null };
};

/** The "Spring launch" board: a phone frame, a headline, shapes and a note. */
function Board() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 260 340"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 size-full p-5"
    >
      <text
        x={20}
        y={30}
        fontSize={8}
        className="fill-ink-3 font-mono"
        letterSpacing={0.6}
      >
        HOME — 390
      </text>
      <rect
        x={20}
        y={36}
        width={126}
        height={228}
        rx={14}
        className="fill-card stroke-hairline-strong"
        strokeWidth={1}
      />
      <rect
        x={32}
        y={50}
        width={40}
        height={6}
        rx={3}
        className="fill-ink-3"
        opacity={0.5}
      />
      <rect
        x={32}
        y={66}
        width={102}
        height={70}
        rx={8}
        className="fill-cobalt-wash"
      />
      <circle cx={112} cy={88} r={11} className="fill-warn" opacity={0.7} />
      <path
        d="M32 128C52 108 70 110 90 122S120 118 134 110V136H32Z"
        className="fill-success"
        opacity={0.55}
      />
      <text
        x={32}
        y={156}
        fontSize={13}
        fontWeight={600}
        className="fill-foreground"
      >
        Spring
      </text>
      <text
        x={32}
        y={172}
        fontSize={13}
        fontWeight={600}
        className="fill-foreground"
      >
        launch
      </text>
      <rect
        x={32}
        y={182}
        width={92}
        height={4}
        rx={2}
        className="fill-ink-3"
        opacity={0.4}
      />
      <rect
        x={32}
        y={190}
        width={70}
        height={4}
        rx={2}
        className="fill-ink-3"
        opacity={0.4}
      />
      <rect
        x={32}
        y={232}
        width={102}
        height={20}
        rx={10}
        className="fill-primary"
      />
      <text
        x={83}
        y={245}
        fontSize={8}
        fontWeight={500}
        textAnchor="middle"
        className="fill-primary-foreground"
      >
        Join the list
      </text>
      <circle
        cx={196}
        cy={82}
        r={30}
        className="fill-none stroke-cobalt-bright"
        strokeWidth={1.5}
      />
      <rect
        x={170}
        y={132}
        width={64}
        height={42}
        rx={4}
        className="fill-signal"
        opacity={0.35}
      />
      <path
        d="M170 206L234 194"
        className="stroke-ink-2"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <g transform="rotate(-3 204 270)">
        <rect
          x={168}
          y={236}
          width={74}
          height={66}
          rx={3}
          className="fill-warn"
          opacity={0.3}
        />
        <rect
          x={176}
          y={250}
          width={52}
          height={3}
          rx={1.5}
          className="fill-ink-2"
          opacity={0.5}
        />
        <rect
          x={176}
          y={258}
          width={44}
          height={3}
          rx={1.5}
          className="fill-ink-2"
          opacity={0.5}
        />
        <rect
          x={176}
          y={266}
          width={48}
          height={3}
          rx={1.5}
          className="fill-ink-2"
          opacity={0.5}
        />
      </g>
    </svg>
  );
}

/**
 * A Fieldline board: pick tools from the rail, or type their letters while
 * the pointer is over the board. Typing in the board's name never switches
 * tools.
 */
export function ToolDockDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tool, setTool] = React.useState("move");
  const [title, setTitle] = React.useState("Spring launch");
  const inputId = React.useId();
  const info = describe(tool);
  const shortcuts = values.shortcuts ?? true;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {chrome ? (
        <div className="flex h-8 items-center gap-2">
          <label
            htmlFor={inputId}
            className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Board
          </label>
          <input
            id={inputId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded-2 border border-input bg-card px-2.5 text-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
        </div>
      ) : null}
      <ToolDock
        label="Board tools"
        canvasLabel={`${title || "Untitled"} board`}
        tools={TOOLS}
        value={tool}
        onValueChange={setTool}
        sound={sound}
        {...values}
      >
        <Board />
      </ToolDock>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">tool {info.name}</span>
          {shortcuts
            ? info.key
              ? ` · key ${info.key}`
              : "group" in info && info.group
                ? ` · cycle with its key`
                : ""
            : " · shortcuts off"}
        </p>
      ) : null}
    </div>
  );
}
