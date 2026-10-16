"use client";

import * as React from "react";

import { RotateCcw, Ticket } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultSpareKeysCodes, SpareKeys } from "@/registry/ui/spare-keys";

export const tweaks = defineTweaks({
  cellStyle: {
    kind: "choice",
    label: "Cells",
    default: "ticket",
    options: ["ticket", "plain", "slip"],
    names: { ticket: "Ticket", plain: "Plain", slip: "Slip" },
  },
  columns: {
    kind: "range",
    label: "Columns",
    default: 2,
    min: 2,
    max: 5,
    step: 1,
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

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A fresh, seeded set: the same round always makes the same ten codes. */
const makeSet = (seed: number): string[] => {
  let a = (seed * 2654435761) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 10 }, () => {
    let code = "";
    for (let i = 0; i < 8; i += 1) {
      code += ALPHABET[Math.floor(next() * ALPHABET.length)] ?? "a";
      if (i === 3) code += "-";
    }
    return code;
  });
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Step three of turning on two-step sign-in at Fieldline: ten codes for
 * mara@fieldline.io that must be kept before Continue opens. Regenerating
 * makes a new seeded set after a short wait.
 */
export function SpareKeysDemo({
  chrome = true,
  // The sheet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [codes, setCodes] = React.useState<string[]>(defaultSpareKeysCodes);
  const [used, setUsed] = React.useState<string[]>([]);
  const [saved, setSaved] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const sets = React.useRef(0);

  const reset = () => {
    sets.current = 0;
    setCodes(defaultSpareKeysCodes);
    setUsed([]);
    setSaved(false);
    setNote(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <SpareKeys
      key={round}
      codes={codes}
      used={used}
      confirmed={saved}
      onConfirmedChange={(next) => {
        setSaved(next);
        setNote(next ? "saved · continue unlocked" : null);
      }}
      onCopy={(list) =>
        setNote(
          list.length === 1
            ? `copied ${list[0] ?? ""}`
            : `copied ${list.length} codes`,
        )
      }
      onDownload={() => setNote("downloaded fieldline-backup-codes.txt")}
      onPrint={() => setNote("print dialog")}
      onRegenerate={async () => {
        setNote("old codes void · making new ones");
        await wait(600);
        sets.current += 1;
        setCodes(makeSet(sets.current));
        setUsed([]);
        setNote("new set · save it again");
      }}
      onConfirm={() => setNote("two-step on")}
      {...values}
    />
  );

  if (!chrome) {
    return <div className="mx-auto w-full max-w-sm">{surface}</div>;
  }

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const left = codes.filter((c) => !used.includes(c)).length;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="w-full max-w-sm self-center">{surface}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <button
          type="button"
          onClick={() => {
            const next = codes.find((c) => !used.includes(c));
            if (!next) return;
            setUsed((u) => [...u, next]);
            setNote(`signed in with ${next}`);
          }}
          className={button}
        >
          <Ticket aria-hidden className="size-3.5" />
          Spend a code
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <>
            <span className="text-signal">{note}</span> · {left} left
          </>
        ) : (
          <>
            <span className="text-signal">{left} codes</span> ·{" "}
            {saved ? "saved" : "not saved yet"}
          </>
        )}
      </p>
    </div>
  );
}
