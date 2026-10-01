"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FoldPhone } from "@/registry/ui/fold-phone";

export const tweaks = defineTweaks({
  fold: {
    kind: "range",
    label: "Fold",
    default: 0,
    min: 0,
    max: 1,
    step: 0.05,
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "ink",
    options: ["ink", "cream", "sage"],
    names: { ink: "Ink", cream: "Cream", sage: "Sage" },
  },
  crease: { kind: "toggle", label: "Crease", default: true },
});

const NOTES = [
  {
    id: "survey",
    title: "Basin survey",
    date: "Mon 14 Oct",
    body: "Water level at the north gauge is down 12 cm since Friday. Recheck the weir after the next tide and log both readings.",
  },
  {
    id: "orders",
    title: "Fernworks order",
    date: "Sun 13 Oct",
    body: "Forty seed trays and two rolls of mesh. Delivery to the east shed, not the office.",
  },
  {
    id: "rota",
    title: "Weekend rota",
    date: "Fri 11 Oct",
    body: "Ana on the pumps Saturday, Theo Sunday. Keys stay in the lockbox by the gate.",
  },
  {
    id: "reading",
    title: "Reading list",
    date: "Wed 9 Oct",
    body: "Tide tables for November. The old river maps from the Coldbrook library.",
  },
];

type Note = (typeof NOTES)[number];

/**
 * Basinworks Notes. On the narrow cover it is a list, and a note opens over
 * it; on the wide inner screen the list and the open note sit side by side.
 */
function NotesApp({
  selected,
  reading,
  onOpen,
  onBack,
}: {
  selected: Note;
  reading: boolean;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full w-full">
      <div
        className={
          reading
            ? "hidden w-1/2 shrink-0 flex-col border-r border-hairline @min-[200px]:flex"
            : "flex w-full shrink-0 flex-col @min-[200px]:w-1/2 @min-[200px]:border-r @min-[200px]:border-hairline"
        }
      >
        <p className="px-3 pt-1 pb-2 text-[13px] font-semibold text-foreground">
          Notes
        </p>
        <ul role="list" className="flex flex-col">
          {NOTES.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onOpen(n.id)}
                className={
                  n.id === selected.id
                    ? "flex w-full flex-col gap-0.5 bg-cobalt-wash px-3 py-1.5 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                    : "flex w-full flex-col gap-0.5 px-3 py-1.5 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                }
              >
                <span className="truncate text-[11px] font-medium text-foreground">
                  {n.title}
                </span>
                <span className="truncate text-[9px] text-ink-3">{n.date}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div
        className={
          reading
            ? "flex min-w-0 flex-1 flex-col gap-1.5 px-3 pt-1"
            : "hidden min-w-0 flex-1 flex-col gap-1.5 px-3 pt-1 @min-[200px]:flex"
        }
      >
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 self-start rounded-1 px-1 text-[11px] text-cobalt-bright outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid @min-[200px]:hidden"
        >
          ‹ Notes
        </button>
        <p className="text-[13px] leading-tight font-semibold text-foreground">
          {selected.title}
        </p>
        <p className="text-[9px] text-ink-3">{selected.date}</p>
        <p className="text-[11px] leading-[1.45] text-ink-2">{selected.body}</p>
      </div>
    </div>
  );
}

/**
 * Basinworks Notes on a foldable: a list on the cover screen, list and note
 * side by side when it is open. The demo seeds its posture from the `fold`
 * tweak and spreads the rest.
 */
export function FoldPhoneDemo({
  chrome = true,
  sound,
  fold: foldTweak,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const seed = foldTweak ?? tweaks.fold.default;
  const [fold, setFold] = React.useState(seed);
  const [seen, setSeen] = React.useState(seed);
  if (seen !== seed) {
    setSeen(seed);
    setFold(seed);
  }
  const [selectedId, setSelectedId] = React.useState("survey");
  const [reading, setReading] = React.useState(false);
  const selected = NOTES.find((n) => n.id === selectedId) ?? NOTES[0];

  const phone = (
    <FoldPhone
      label="Basinworks Notes on a foldable phone"
      sound={sound}
      {...values}
      fold={fold}
      onFoldChange={setFold}
    >
      {selected ? (
        <NotesApp
          selected={selected}
          reading={reading}
          onOpen={(id) => {
            setSelectedId(id);
            setReading(true);
          }}
          onBack={() => setReading(false)}
        />
      ) : null}
    </FoldPhone>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[340px]">{phone}</div>;
  }

  const posture =
    fold <= 0
      ? "folded · cover screen · notes list"
      : fold >= 1
        ? "open flat · inner screen · list and note"
        : `half open · ${Math.round(fold * 180)}°`;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex w-full max-w-[300px] self-center">{phone}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{posture}</span>
      </p>
    </div>
  );
}
