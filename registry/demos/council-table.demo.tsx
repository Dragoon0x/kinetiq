"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CouncilTable,
  defaultCouncilNow,
  defaultCouncilSpecialists,
  defaultCouncilTurns,
  type CouncilSpecialist,
  type CouncilTurn,
} from "@/registry/ui/council-table";

export const tweaks = defineTweaks({
  seatShape: {
    kind: "choice",
    label: "Seats",
    default: "disc",
    options: ["disc", "tile", "arch"],
    names: { disc: "Disc", tile: "Tile", arch: "Arch" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** What each specialist says when the floor comes to it. */
const SCRIPT: Record<string, Omit<CouncilTurn, "id" | "at" | "author">> = {
  support: {
    text: "Expect more than 8% to leave. The last time a price moved mid-renewal, teams under ten seats cancelled at twice the usual rate. Keep them on $18 until their renewal and the loss stays near 5%.",
    disputes: "a3",
    disputeNote: "churn estimate",
  },
  planning: {
    text: "Then it's one step on 1 September, with the notice out by 1 July and small teams moving at renewal. I'll draft the timeline.",
  },
  legal: {
    text: "A notice sent by 1 July covers every contract, the pre-June ones included. Renewal-date pricing for small teams needs no extra notice.",
  },
  finance: {
    text: "With small teams held to renewal, revenue still rises about 19% in the first year, and the hold costs under $90k.",
  },
};

const QUESTION = "Support, how will small teams take a single jump to $24?";

const SUMMARY: CouncilTurn = {
  id: "summary",
  author: "council",
  at: defaultCouncilNow,
  text: "",
  points: [
    { specialist: "planning", text: "One step on 1 September." },
    {
      specialist: "legal",
      text: "Notice out by 1 July covers every contract.",
    },
    { specialist: "finance", text: "Revenue up about 19% in year one." },
    { specialist: "support", text: "Teams under ten seats move at renewal." },
  ],
};

/**
 * Basinworks is raising its Team plan from $18 to $24 a seat, and the
 * council is weighing in. The gallery card hands Support the floor once it
 * is seen: the baton travels, Support thinks, and its reply disputes
 * Finance's churn estimate.
 */
export function CouncilTableDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [turns, setTurns] = React.useState<CouncilTurn[]>(defaultCouncilTurns);
  const [states, setStates] = React.useState<
    Record<string, CouncilSpecialist["state"]>
  >({});
  const [summarising, setSummarising] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.35 });
  const timers = React.useRef<number[]>([]);
  const turnsRef = React.useRef(turns);
  React.useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const specialists = defaultCouncilSpecialists.map((s) => ({
    ...s,
    state: states[s.id] ?? "idle",
  }));

  const nameOf = (id: string) =>
    defaultCouncilSpecialists.find((s) => s.id === id)?.name ?? id;

  /** The floor goes to `id`: it thinks for a moment, then answers. */
  const answer = (id: string, failNext = false) => {
    setStates((s) => ({ ...s, [id]: "thinking" }));
    setNote(`${nameOf(id).toLowerCase()} thinking`);
    later(1700, () => {
      if (failNext) {
        setStates((s) => ({ ...s, [id]: "failed" }));
        setNote(`${nameOf(id).toLowerCase()} failed · retry offered`);
        return;
      }
      // A specialist disputes only the first time it speaks.
      const said = turnsRef.current.some((t) => t.author === id);
      const script = SCRIPT[id];
      if (!script) return;
      const turn: CouncilTurn = {
        id: `${id}-${turnsRef.current.length}`,
        author: id,
        at: defaultCouncilNow,
        ...(said ? { text: script.text } : script),
      };
      setStates((s) => ({ ...s, [id]: "idle" }));
      setTurns((list) => [...list, turn]);
      const target = turn.disputes
        ? turnsRef.current.find((t) => t.id === turn.disputes)
        : undefined;
      setNote(
        `floor · ${nameOf(id).toLowerCase()}${
          target ? ` · disputes ${nameOf(target.author).toLowerCase()}` : ""
        }`,
      );
    });
  };

  const askSupport = () => {
    setTurns((list) => [
      ...list,
      {
        id: `ask-${list.length}`,
        author: "you",
        to: "support",
        at: defaultCouncilNow,
        text: QUESTION,
      },
    ]);
    later(450, () => answer("support"));
  };

  // The gallery card asks once it has been seen.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (chrome || !inView || asked.current) return;
    const t = window.setTimeout(() => {
      asked.current = true;
      askSupport();
    }, 900);
    return () => window.clearTimeout(t);
    // askSupport only schedules through refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chrome, inView]);

  const surface = (
    <CouncilTable
      key={round}
      specialists={specialists}
      turns={turns}
      onTurnsChange={setTurns}
      onSend={(_, to) => later(400, () => answer(to ?? "planning"))}
      onRetry={(id) => answer(id)}
      onDismiss={(id) =>
        setNote(`${nameOf(id).toLowerCase()} dismissed · bring back above`)
      }
      onRestore={(id) =>
        setNote(`${nameOf(id).toLowerCase()} back at the table`)
      }
      onAddressSpecialist={(id) =>
        setNote(
          id
            ? `addressing ${nameOf(id).toLowerCase()}`
            : "addressing the council",
        )
      }
      summarising={summarising}
      onSummarise={() => {
        setSummarising(true);
        setNote("summarising");
        later(1200, () => {
          setSummarising(false);
          setTurns((list) => [
            ...list.filter((t) => t.id !== SUMMARY.id),
            SUMMARY,
          ]);
          setNote(`summary · ${SUMMARY.points?.length ?? 0} points`);
        });
      }}
      now={defaultCouncilNow}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={askSupport} className={button}>
          Ask Support
        </button>
        <button
          type="button"
          onClick={() => {
            setTurns((list) => [
              ...list,
              {
                id: `ask-${list.length}`,
                author: "you",
                to: "finance",
                at: defaultCouncilNow,
                text: "Finance, what does holding small teams cost?",
              },
            ]);
            later(400, () => answer("finance", true));
          }}
          className={button}
        >
          Fail a seat
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            setTurns(defaultCouncilTurns);
            setStates({});
            setSummarising(false);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note ?? "floor · finance"}</span>
        {" · basinworks pricing council"}
      </p>
    </div>
  );
}
