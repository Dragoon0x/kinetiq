"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { JiggleMode, type JiggleModeItem } from "@/registry/ui/jiggle-mode";

export const tweaks = defineTweaks({
  wiggle: {
    kind: "range",
    label: "Wiggle",
    default: 2,
    min: 0.5,
    max: 4,
    step: 0.5,
    unit: "°",
  },
  frequency: {
    kind: "range",
    label: "Frequency",
    default: 3.5,
    min: 1.5,
    max: 6,
    step: 0.5,
    unit: "Hz",
  },
  badge: {
    kind: "choice",
    label: "Badge",
    default: "remove",
    options: ["remove", "check"],
    names: { remove: "Remove", check: "Check" },
  },
  delay: {
    kind: "range",
    label: "Delay",
    default: 500,
    min: 250,
    max: 1000,
    step: 50,
    unit: "ms",
  },
});

const glyph = (children: React.ReactNode) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

/** The Fieldline workspace's home row of shortcuts. */
const SHORTCUTS: JiggleModeItem[] = [
  {
    id: "inbox",
    label: "Inbox",
    tone: "cobalt",
    glyph: glyph(
      <>
        <path d="M3 11 5 4.5h10L17 11v4.5H3Z" />
        <path d="M3 11h4l1 2h4l1-2h4" />
      </>,
    ),
  },
  {
    id: "calendar",
    label: "Calendar",
    tone: "danger",
    glyph: glyph(
      <>
        <rect x={3} y={4.5} width={14} height={12} rx={2} />
        <path d="M3 8.5h14M7 3v3M13 3v3" />
      </>,
    ),
  },
  {
    id: "files",
    label: "Files",
    tone: "warn",
    glyph: glyph(
      <path d="M3 6.5V15a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15V8a1.5 1.5 0 0 0-1.5-1.5H10L8.5 4.5h-4A1.5 1.5 0 0 0 3 6Z" />,
    ),
  },
  {
    id: "budget",
    label: "Budget",
    tone: "success",
    glyph: glyph(
      <>
        <circle cx={10} cy={10} r={6.5} />
        <path d="M10 3.5V10h6.5" />
      </>,
    ),
  },
  {
    id: "notes",
    label: "Notes",
    tone: "ink",
    glyph: glyph(
      <>
        <rect x={4} y={3} width={12} height={14} rx={2} />
        <path d="M7 7.5h6M7 10.5h6M7 13.5h3.5" />
      </>,
    ),
  },
  {
    id: "reports",
    label: "Reports",
    tone: "signal",
    glyph: glyph(<path d="M4 16.5h12M6.5 13.5V9.5M10 13.5V5.5M13.5 13.5V11" />),
  },
  {
    id: "team",
    label: "Team",
    tone: "cobalt",
    glyph: glyph(
      <>
        <circle cx={7.5} cy={7.5} r={2.5} />
        <circle cx={13.5} cy={8.5} r={2} />
        <path d="M3 16c.6-2.4 2.3-3.6 4.5-3.6S11.4 13.6 12 16M12.5 12.6c1.9 0 3.4 1 4 3.4" />
      </>,
    ),
  },
  {
    id: "settings",
    label: "Settings",
    tone: "ink",
    glyph: glyph(
      <>
        <path d="M4 6h8M15 6h1M4 14h1M8 14h8" />
        <circle cx={13.5} cy={6} r={1.5} />
        <circle cx={6.5} cy={14} r={1.5} />
      </>,
    ),
  },
];

const nameOf = (id: string) =>
  SHORTCUTS.find((s) => s.id === id)?.label.toLowerCase() ?? id;

/**
 * The Fieldline workspace home: eight shortcuts. Press one to open it; hold
 * one and every tile gets ready to be moved or removed.
 */
export function JiggleModeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [order, setOrder] = React.useState(() => SHORTCUTS.map((s) => s.id));
  const [editing, setEditing] = React.useState(false);
  const [last, setLast] = React.useState<string | null>(null);

  const count = order.length;
  const tally = `${count} ${count === 1 ? "shortcut" : "shortcuts"}`;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <JiggleMode
        label="Fieldline shortcuts"
        items={SHORTCUTS}
        value={order}
        onValueChange={(next) => {
          const gone = order.filter((id) => !next.includes(id));
          const back = next.filter((id) => !order.includes(id));
          if (gone.length > 0) {
            setLast(
              gone.length === 1
                ? `${nameOf(gone[0] ?? "")} removed`
                : `${gone.length} removed`,
            );
          } else if (back.length > 0) {
            setLast(`${back.map(nameOf).join(", ")} restored`);
          } else {
            setLast("order changed");
          }
          setOrder(next);
        }}
        editing={editing}
        onEditingChange={setEditing}
        onOpen={(id) => setLast(`opened ${nameOf(id)}`)}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {editing ? (
            <>
              <span className="text-signal">editing</span> · drag to reorder
            </>
          ) : (
            <>
              <span className="text-signal">{tally}</span> ·{" "}
              {last ?? "hold one to edit"}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
