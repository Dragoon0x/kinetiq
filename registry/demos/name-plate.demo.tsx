"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultNamePlateTaken,
  defaultNamePlateValue,
  NamePlate,
  type NamePlateAvailability,
  type NamePlateValue,
} from "@/registry/ui/name-plate";

export const tweaks = defineTweaks({
  plateStyle: {
    kind: "choice",
    label: "Plate",
    default: "enamel",
    options: ["enamel", "brass", "timber"],
    names: { enamel: "Enamel", brass: "Brass", timber: "Timber" },
  },
  swingAmount: {
    kind: "range",
    label: "Swing",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** The crew lead has started typing; the sign is already up. */
const START: NamePlateValue = {
  ...defaultNamePlateValue,
  name: "Harbour Crew",
  address: "harbour-crew",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * A Basinworks crew lead names the harbour operations workspace. The address
 * check answers after a short network wait; "Fail next create" makes the
 * next create refuse once, so the kept fields can be seen.
 */
export function NamePlateDemo({
  chrome = true,
  // The plate is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [value, setValue] = React.useState<NamePlateValue>(START);
  const [answer, setAnswer] = React.useState<{
    slug: string;
    state: NamePlateAvailability;
  } | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [outcome, setOutcome] = React.useState<string | null>(null);
  const failRef = React.useRef(failNext);
  React.useEffect(() => {
    failRef.current = failNext;
  });
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const checkAddress = React.useCallback(
    (slug: string) =>
      new Promise<NamePlateAvailability>((resolve) => {
        timers.current.push(
          window.setTimeout(() => {
            const state = defaultNamePlateTaken.includes(slug)
              ? "taken"
              : "available";
            setAnswer({ slug, state });
            resolve(state);
          }, 320),
        );
      }),
    [],
  );

  const plate = (
    <NamePlate
      key={round}
      value={value}
      onChange={(v) => {
        setValue(v);
        setOutcome(null);
      }}
      checkAddress={checkAddress}
      onCreate={(v) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          if (fail) setFailNext(false);
          timers.current.push(
            window.setTimeout(() => {
              if (fail) {
                setOutcome("create failed · fields kept");
                reject(new Error("the address was claimed a moment ago"));
              } else {
                setOutcome(`created ${v.name.trim().toLowerCase()}`);
                resolve();
              }
            }, 900),
          );
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{plate}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS,
  );
  const known = answer && answer.slug === value.address ? answer.state : null;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {plate}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next create
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(START);
            setAnswer(null);
            setFailNext(false);
            setOutcome(null);
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
        {outcome ? (
          <span className="text-signal">{outcome}</span>
        ) : value.address ? (
          <>
            <span className="text-signal">fieldline.app/{value.address}</span> ·{" "}
            {known ?? "checking address"}
          </>
        ) : (
          <>
            <span className="text-signal">no name yet</span> · type one to hang
            the sign
          </>
        )}
      </p>
    </div>
  );
}
