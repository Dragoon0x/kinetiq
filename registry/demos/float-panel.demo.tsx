"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  FloatPanel,
  type FloatPanelPlacement,
} from "@/registry/ui/float-panel";

export const tweaks = defineTweaks({
  magnet: {
    kind: "range",
    label: "Magnet",
    default: 24,
    min: 0,
    max: 48,
    step: 4,
    unit: "px",
  },
  collapse: {
    kind: "range",
    label: "Collapse",
    default: 64,
    min: 0,
    max: 96,
    step: 8,
    unit: "px",
  },
  widths: {
    kind: "range",
    label: "Widths",
    default: 3,
    min: 0,
    max: 5,
    step: 1,
  },
});

type Shape = {
  id: string;
  name: string;
  kind: "box" | "round";
  /** Box on the canvas, in % of its width and height. */
  at: [number, number, number, number];
  props: [string, string][];
  note?: string;
};

type Plan = { id: string; name: string; shapes: Shape[] };

const PLANS: Plan[] = [
  {
    id: "site",
    name: "Site plan",
    shapes: [
      {
        id: "pump",
        name: "Pump house",
        kind: "box",
        at: [12, 28, 22, 22],
        props: [
          ["X", "184"],
          ["Y", "96"],
          ["W", "120"],
          ["H", "72"],
          ["Stroke", "1 px"],
          ["Opacity", "100%"],
        ],
        note: "Two pumps; service door on the east wall.",
      },
      {
        id: "tank",
        name: "Settling tank",
        kind: "round",
        at: [44, 18, 18, 30],
        props: [
          ["X", "412"],
          ["Y", "64"],
          ["Diameter", "96"],
          ["Volume", "340 m³"],
          ["Stroke", "1.5 px"],
          ["Opacity", "90%"],
          ["Inflow", "From pump house"],
          ["Outflow", "To outfall"],
        ],
      },
      {
        id: "outfall",
        name: "Outfall",
        kind: "box",
        at: [70, 64, 10, 10],
        props: [
          ["X", "640"],
          ["Y", "288"],
          ["Flow", "12 l/s"],
        ],
      },
    ],
  },
  {
    id: "drainage",
    name: "Drainage",
    shapes: [
      {
        id: "culvert",
        name: "Culvert",
        kind: "box",
        at: [20, 40, 40, 12],
        props: [
          ["Length", "38 m"],
          ["Bore", "600 mm"],
          ["Fall", "1 in 120"],
          ["Material", "Concrete"],
        ],
        note: "Silt trap at the upstream end.",
      },
      {
        id: "headwall",
        name: "Headwall",
        kind: "box",
        at: [64, 30, 12, 32],
        props: [
          ["Height", "1.4 m"],
          ["Wing walls", "Two"],
        ],
      },
    ],
  },
];

const say = (p: FloatPanelPlacement) =>
  p.mode === "dock"
    ? `docked ${p.side} · ${Math.round(p.width)} px`
    : p.mode === "pill"
      ? `collapsed · ${p.corner.replace("-", " ")}`
      : `floating · ${Math.round(p.width)} px`;

function Canvas({
  plan,
  selected,
  onSelect,
}: {
  plan: Plan;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-hairline px-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span className="truncate">Basinworks · {plan.name}</span>
      </div>
      <div className="relative flex-1 bg-[radial-gradient(var(--hairline-strong)_1px,transparent_1px)] bg-[size:16px_16px]">
        {plan.shapes.map((shape) => {
          const [x, y, w, h] = shape.at;
          const on = shape.id === selected;
          return (
            <button
              key={shape.id}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(shape.id)}
              className={cn(
                "absolute flex items-center justify-center border text-[11px] text-ink-2 transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                shape.kind === "round" ? "rounded-full" : "rounded-1",
                on
                  ? "border-cobalt-bright bg-cobalt-wash text-foreground"
                  : "border-hairline-strong bg-surface-2 hover:border-ink-3",
              )}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: `${w}%`,
                height: `${h}%`,
              }}
            >
              <span className="truncate px-1">{shape.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Inspector({ shape }: { shape: Shape }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "size-3 shrink-0 border border-cobalt-bright bg-cobalt-wash",
            shape.kind === "round" ? "rounded-full" : "rounded-[3px]",
          )}
        />
        <p className="truncate text-[13px] font-medium text-foreground">
          {shape.name}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-1.5">
        {shape.props.map(([term, value]) => (
          <div
            key={term}
            className="flex h-8 min-w-0 items-center justify-between gap-2 rounded-2 border border-hairline bg-surface-1 px-2"
          >
            <dt className="shrink-0 text-[11px] text-ink-3">{term}</dt>
            <dd className="truncate font-mono text-[12px] text-foreground tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {shape.note ? (
        <p className="text-xs leading-5 text-ink-2">{shape.note}</p>
      ) : null}
    </div>
  );
}

/**
 * A Basinworks site plan with its layer inspector: drag the inspector by its
 * title, dock it to a side, fold it into a corner, or pull its edge. Each
 * plan remembers where its inspector was left.
 */
export function FloatPanelDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [planId, setPlanId] = React.useState("site");
  const plan = PLANS.find((p) => p.id === planId) ?? (PLANS[0] as Plan);
  const [picked, setPicked] = React.useState<Record<string, string>>({
    site: "pump",
    drainage: "culvert",
  });
  const shape =
    plan.shapes.find((s) => s.id === picked[plan.id]) ??
    (plan.shapes[0] as Shape);
  const [last, setLast] = React.useState<FloatPanelPlacement | null>(null);

  const panel = (
    <FloatPanel
      title="Inspector"
      storageKey={`basinworks-${plan.id}`}
      height={chrome ? 440 : 460}
      label={`Basinworks ${plan.name}`}
      onPlacementChange={setLast}
      badge={plan.shapes.length}
      workspace={
        <Canvas
          plan={plan}
          selected={shape.id}
          onSelect={(id) => setPicked((p) => ({ ...p, [plan.id]: id }))}
        />
      }
      sound={sound}
      {...values}
    >
      <Inspector shape={shape} />
    </FloatPanel>
  );

  if (!chrome) return <div className="w-full max-w-3xl">{panel}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div
        role="group"
        aria-label="Plan"
        className="flex h-8 items-center gap-1 self-start rounded-2 border border-hairline bg-surface-1 p-0.5"
      >
        {PLANS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === planId}
            onClick={() => {
              setPlanId(p.id);
              setLast(null);
            }}
            className={cn(
              "inline-flex h-full items-center rounded-1 px-3 text-xs transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              p.id === planId
                ? "bg-surface-2 text-foreground"
                : "text-ink-3 hover:text-foreground",
            )}
          >
            {p.name}
          </button>
        ))}
      </div>
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{shape.name}</span> ·{" "}
        {last ? say(last) : "drag the inspector by its title"}
      </p>
    </div>
  );
}
