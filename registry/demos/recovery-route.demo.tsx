"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRecoveryMethods,
  RecoveryRoute,
} from "@/registry/ui/recovery-route";

export const tweaks = defineTweaks({
  routeStyle: {
    kind: "choice",
    label: "Route",
    default: "curve",
    options: ["curve", "dotted", "metro"],
    names: { curve: "Curve", dotted: "Dotted", metro: "Metro" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "calm",
    options: ["calm", "warm", "plain"],
    names: { calm: "Calm", warm: "Warm", plain: "Plain" },
  },
});

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Mara is locked out of Fieldline. The recovery email is chosen when the
 * page opens, so its route draws as the map comes into view; the first
 * backup code she tries is refused, the second lets her back in.
 */
export function RecoveryRouteDemo({
  chrome = true,
  // The chooser is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [chosen, setChosen] = React.useState<string>("email");
  const [note, setNote] = React.useState<string | null>(null);
  const tries = React.useRef(0);

  const reset = () => {
    tries.current = 0;
    setChosen("email");
    setNote(null);
    setRound((r) => r + 1);
  };

  const method = defaultRecoveryMethods.find((m) => m.id === chosen);

  const surface = (
    <RecoveryRoute
      key={round}
      value={chosen}
      onValueChange={(id) => {
        setChosen(id);
        setNote(null);
      }}
      onSubmit={async (m, input) => {
        await wait(m.kind === "support" ? 900 : 650);
        if (m.kind === "code") {
          tries.current += 1;
          if (tries.current === 1) {
            setNote("code refused · step kept");
            throw new Error("That code didn’t match. 4 tries left.");
          }
          setNote("back in");
          return;
        }
        if (m.kind === "email") {
          setNote(input.stage === 0 ? "link sent" : "link sent again");
          return;
        }
        if (m.kind === "contact") {
          setNote(input.stage === 0 ? "request sent to ana" : "back in");
          return;
        }
        setNote("review requested");
      }}
      onContactSupport={() => setNote("contact support")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <span className="text-[11px] text-ink-3">
          Any eight letters work as a backup code the second time
        </span>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <>
            <span className="text-signal">{note}</span> ·{" "}
            {method?.label ?? "no route"}
          </>
        ) : (
          <>
            <span className="text-signal">
              route · {method?.label ?? "none"}
            </span>{" "}
            · {method?.wait ?? "pick a way back in"}
          </>
        )}
      </p>
    </div>
  );
}
