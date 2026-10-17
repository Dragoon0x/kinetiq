"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRecordStepperNow,
  defaultRecordStepperOrder,
  defaultRecordStepperRecords,
  RecordStepper,
  type RecordStepperRecord,
} from "@/registry/ui/record-stepper";

export const tweaks = defineTweaks({
  slideDistance: {
    kind: "range",
    label: "Slide",
    default: 16,
    min: 8,
    max: 32,
    step: 4,
    unit: "px",
  },
  counterStyle: {
    kind: "choice",
    label: "Counter",
    default: "words",
    options: ["words", "slash", "track"],
    names: { words: "Words", slash: "Slash", track: "Track" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const TITLES = [
  "Two-factor codes arrive after they expire",
  "Shared folder shows as empty on mobile",
  "Duplicate charge on the October invoice",
  "Audit log missing yesterday's exports",
  "Can't remove a card that has expired",
  "Search ignores accents in customer names",
  "Calendar sync skips recurring events",
  "API key rotated but the old one still works",
];
const PEOPLE: [string, string][] = [
  ["Lena Moraes", "Coldbrook Roasters"],
  ["Ravi Sundaram", "Fieldline Freight"],
  ["Ada Kowal", "Waylight Cargo"],
  ["Jonas Ek", "Basinworks"],
  ["Noor Haddad", "Fernworks Studio"],
];
const STATES = ["open", "pending", "new", "on-hold"] as const;

/** What the fake fetch returns for a ticket outside the loaded window. */
const fetched = (id: string): RecordStepperRecord => {
  const n = Number(id.slice(3)) || 0;
  const [requester, company] = PEOPLE[n % PEOPLE.length] ?? ["", ""];
  return {
    id,
    title: TITLES[n % TITLES.length] ?? "",
    requester,
    company,
    state: STATES[n % STATES.length] ?? "open",
    priority: n % 5 === 0 ? "urgent" : "high",
    updatedAt: defaultRecordStepperNow - ((n * 7) % 180) * 60_000,
    excerpt:
      "Reported by two people on the team this week. Steps to reproduce and a screenshot are attached to the first message.",
  };
};

/**
 * Gaugeworks' open, high-priority support queue: 240 tickets, opened at #12
 * with #10–15 loaded. Stepping further fetches the ticket after 600 ms, so
 * the loading neighbour shows. The gallery card steps to #13 and back once.
 */
export function RecordStepperDemo({
  chrome = true,
  // The header is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [position, setPosition] = React.useState(12);
  const [records, setRecords] = React.useState<RecordStepperRecord[]>(
    defaultRecordStepperRecords,
  );
  const [note, setNote] = React.useState("");
  const frame = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const loads = React.useRef<number[]>([]);

  React.useEffect(
    () => () => {
      for (const t of loads.current) window.clearTimeout(t);
    },
    [],
  );

  React.useEffect(() => {
    const node = frame.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timers: number[] = [];
    const io = new IntersectionObserver(([entry]) => {
      for (const t of timers) window.clearTimeout(t);
      timers = [];
      if (!entry?.isIntersecting || once.current) return;
      timers = [
        window.setTimeout(() => setPosition(13), 1100),
        window.setTimeout(() => {
          once.current = true;
          setPosition(12);
        }, 2900),
      ];
    });
    io.observe(node);
    return () => {
      for (const t of timers) window.clearTimeout(t);
      io.disconnect();
    };
  }, [chrome]);

  const header = (
    <RecordStepper
      records={records}
      position={position}
      onStep={(_, to, record) => {
        setPosition(to);
        setNote("");
        if (record) return;
        const id = defaultRecordStepperOrder[to - 1];
        if (!id) return;
        loads.current.push(
          window.setTimeout(
            () =>
              setRecords((list) =>
                list.some((r) => r.id === id) ? list : [...list, fetched(id)],
              ),
            600,
          ),
        );
      }}
      onBackToList={() => setNote("back to the list")}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={frame} className="w-full max-w-3xl">
        {header}
      </div>
    );
  }

  const id = defaultRecordStepperOrder[position - 1] ?? "";
  const loaded = records.some((r) => r.id === id);

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            for (const t of loads.current) window.clearTimeout(t);
            loads.current = [];
            setPosition(12);
            setRecords(defaultRecordStepperRecords);
            setNote("");
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <span className="text-xs text-ink-3">
          J next · K previous · Esc back to the list
        </span>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{`${position} of ${defaultRecordStepperOrder.length}`}</span>
        {` · ${id} · ${loaded ? "loaded" : "loading neighbour"}${note ? ` · ${note}` : ""}`}
      </p>
    </div>
  );
}
