"use client";

import * as React from "react";

import { Plus, RotateCcw, TriangleAlert } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPinchCards,
  defaultPinchFrames,
  defaultPinchValue,
  PinchBoard,
  type PinchBoardValue,
  type PinchCard,
} from "@/registry/ui/pinch-board";

export const tweaks = defineTweaks({
  minimap: {
    kind: "toggle",
    label: "Minimap",
    default: true,
  },
  cardStyle: {
    kind: "choice",
    label: "Notes",
    default: "sticky",
    options: ["sticky", "card", "flat"],
    names: { sticky: "Sticky", card: "Card", flat: "Flat" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

type Status = "ready" | "loading" | "error";

const EXTRA: Omit<PinchCard, "id">[] = [
  {
    title: "Bulk reading import",
    body: "Drop a spreadsheet of readings and map its columns once.",
    tags: ["Platform"],
    color: "cobalt",
  },
  {
    title: "Gauge annotations",
    body: "Pin a note to a point on the chart for the next shift.",
    tags: ["Design", "Ops"],
    color: "rose",
  },
  {
    title: "Webhook retries",
    body: "Back off and retry for an hour before giving up on an endpoint.",
    tags: ["Platform"],
    color: "signal",
  },
];

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Gaugeworks' roadmap board: fourteen notes across Now, Next, Later and
 * Parked. Pinch or scroll to zoom, drag a note between horizons, and add a
 * fresh one to the Now frame.
 */
export function PinchBoardDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [cards, setCards] = React.useState<PinchCard[]>(defaultPinchCards);
  const [value, setValue] = React.useState<PinchBoardValue>(defaultPinchValue);
  const [status, setStatus] = React.useState<Status>("ready");
  const [zoom, setZoom] = React.useState(1);
  const [added, setAdded] = React.useState(0);
  const failNext = React.useRef(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <PinchBoard height={540} {...values} />
      </div>
    );
  }

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(failNext.current ? "error" : "ready");
      failNext.current = false;
    }, 900);
  };

  const addNote = () => {
    const now = defaultPinchFrames[0];
    if (!now) return;
    const spec = EXTRA[added % EXTRA.length];
    if (!spec) return;
    const id = `note-${added + 1}`;
    const n = cards.filter((c) => value[c.id]?.frameId === now.id).length;
    setCards((list) => [...list, { ...spec, id }]);
    setValue((v) => ({
      ...v,
      [id]: {
        x: now.x + 20 + (n % 3) * 200,
        y: now.y + 56 + Math.floor(n / 3) * 150,
        frameId: now.id,
      },
    }));
    setAdded((a) => a + 1);
  };

  const reset = () => {
    setCards(defaultPinchCards);
    setValue(defaultPinchValue);
    setAdded(0);
    setStatus("ready");
  };

  const inFrames = defaultPinchFrames
    .map(
      (f) =>
        `${f.title.toLowerCase()} ${cards.filter((c) => value[c.id]?.frameId === f.id).length}`,
    )
    .join(" · ");

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <PinchBoard
        height={560}
        cards={cards}
        value={value}
        onChange={setValue}
        onZoomChange={setZoom}
        status={status}
        onRetry={load}
        onAddCard={addNote}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            zoom {Math.round(zoom * 100)}% · {cards.length} notes
          </span>{" "}
          · {inFrames}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={addNote} className={BUTTON}>
            <Plus aria-hidden className="size-3.5" />
            Add a note
          </button>
          <button type="button" onClick={load} className={BUTTON}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              failNext.current = true;
              load();
            }}
            className={BUTTON}
          >
            <TriangleAlert aria-hidden className="size-3.5" />
            Fail next
          </button>
          <button type="button" onClick={reset} className={BUTTON}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
