"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSeatMembers,
  defaultSeatPricing,
  SeatPlanner,
} from "@/registry/ui/seat-planner";

export const tweaks = defineTweaks({
  chairStyle: {
    kind: "choice",
    label: "Seats",
    default: "chair",
    options: ["chair", "stool", "dot"],
    names: { chair: "Chair", stool: "Stool", dot: "Dot" },
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 10,
    min: 4,
    max: 20,
    step: 2,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const PAID = 10;
const SAVE_MS = 700;
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

/**
 * The admin of the Coldbrook workspace on Team at $12 a seat: ten seats
 * paid, eight people seated, three invited and waiting, seventeen days into
 * October.
 */
export function SeatPlannerDemo({
  chrome = true,
  // The planner is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [paid, setPaid] = React.useState(PAID);
  const [draft, setDraft] = React.useState(PAID);
  const [taken, setTaken] = React.useState(
    defaultSeatMembers.filter((m) => m.seated).length,
  );
  const [note, setNote] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const surface = (
    <SeatPlanner
      key={round}
      seats={paid}
      onSeatsChange={(n) => {
        setDraft(n);
        setNote(null);
      }}
      onAssign={(_, chair) => {
        setTaken((t) => t + (chair === null ? -1 : 1));
        setNote(chair === null ? "seat freed" : `seated in chair ${chair + 1}`);
      }}
      onConfirm={(change) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          if (fail) setFailNext(false);
          timers.current.push(
            window.setTimeout(() => {
              if (fail) {
                setNote("declined · draft kept");
                reject(new Error("The card was declined."));
                return;
              }
              setPaid(change.seats);
              setNote(
                change.charge > 0
                  ? `confirmed · ${money(change.charge)} charged`
                  : change.credit > 0
                    ? `confirmed · ${money(change.credit)} credit`
                    : "confirmed",
              );
              resolve();
            }, SAVE_MS),
          );
        })
      }
      onDiscard={() => {
        setDraft(paid);
        setNote("draft discarded");
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const share =
    (Date.UTC(2026, 10, 1) - Date.UTC(2026, 9, 17)) /
    (defaultSeatPricing.periodEnd - defaultSeatPricing.periodStart);
  const delta = draft - paid;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => {
            failRef.current = !failNext;
            setFailNext((v) => !v);
          }}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next confirm
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            failRef.current = false;
            setFailNext(false);
            setPaid(PAID);
            setDraft(PAID);
            setTaken(defaultSeatMembers.filter((m) => m.seated).length);
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
        <span className="text-signal">
          {note ?? `${draft} seats · ${taken} taken`}
        </span>
        {" · "}
        {delta > 0
          ? `+${money(Math.round(delta * defaultSeatPricing.perSeat * share * 100) / 100)} today`
          : delta < 0
            ? `${-delta} to remove`
            : "no changes"}
      </p>
    </div>
  );
}
