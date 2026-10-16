"use client";

import * as React from "react";

import { RotateCcw, Smartphone, TimerOff } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultScreenPairingAccount,
  ScreenPairing,
  type ScreenPairingAccount,
} from "@/registry/ui/screen-pairing";

export const tweaks = defineTweaks({
  tileStyle: {
    kind: "choice",
    label: "Tiles",
    default: "flap",
    options: ["flap", "keycap", "outline", "solid"],
    names: {
      flap: "Flap",
      keycap: "Keycap",
      outline: "Outline",
      solid: "Solid",
    },
  },
  codeLength: {
    kind: "range",
    label: "Length",
    default: 8,
    min: 4,
    max: 10,
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

const LIFETIME = 120;
const CHECK_MS = 2000;
/** On the gallery card nobody is holding a phone: the fourth check approves. */
const AUTO_AFTER = 4;

type Note =
  | { kind: "waiting" }
  | { kind: "approved"; name: string }
  | { kind: "expired" }
  | { kind: "fresh" }
  | { kind: "out" };

/**
 * The display in Coldbrook's Harbour Room. Somebody walks in for the design
 * review, reads the code off the wall and approves the room from their phone.
 */
export function ScreenPairingDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [lifetime, setLifetime] = React.useState(LIFETIME);
  const [checks, setChecks] = React.useState(0);
  const [note, setNote] = React.useState<Note>({ kind: "waiting" });
  const approveNext = React.useRef(false);
  const count = React.useRef(0);

  const poll = React.useCallback(
    () =>
      new Promise<ScreenPairingAccount | null>((resolve) => {
        count.current += 1;
        setChecks(count.current);
        const yes =
          approveNext.current || (!chrome && count.current >= AUTO_AFTER);
        // A phone on the room's network answers in about a quarter second.
        window.setTimeout(() => {
          if (yes) approveNext.current = false;
          resolve(yes ? defaultScreenPairingAccount : null);
        }, 240);
      }),
    [chrome],
  );

  const restartChecks = () => {
    count.current = 0;
    setChecks(0);
  };

  const surface = (
    <ScreenPairing
      key={run}
      poll={poll}
      pollInterval={CHECK_MS}
      expiresIn={lifetime}
      onApproved={(account) =>
        setNote({ kind: "approved", name: account.name })
      }
      onExpire={() => setNote({ kind: "expired" })}
      onRefresh={() => {
        restartChecks();
        setLifetime(LIFETIME);
        setNote({ kind: "fresh" });
      }}
      onSignOut={() => {
        restartChecks();
        setLifetime(LIFETIME);
        setNote({ kind: "out" });
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50 aria-disabled:hover:bg-transparent",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  // Kept focusable while the code is not waiting: these buttons can lose
  // their meaning under the visitor's focus, and a disabled one drops it.
  const waitingOff = note.kind === "approved" || note.kind === "expired";

  const line =
    note.kind === "approved" ? (
      <>
        <span className="text-signal">approved</span> · {note.name} · welcome
        shown
      </>
    ) : note.kind === "expired" ? (
      <>
        <span className="text-signal">code expired</span> · new one offered
      </>
    ) : (
      <>
        <span className="text-signal">
          {note.kind === "out"
            ? "signed out"
            : note.kind === "fresh"
              ? "new code"
              : "waiting"}
        </span>{" "}
        · {checks} {checks === 1 ? "check" : "checks"} · every {CHECK_MS / 1000}{" "}
        s
      </>
    );

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={waitingOff || undefined}
          onClick={() => {
            if (!waitingOff) approveNext.current = true;
          }}
          className={button}
        >
          <Smartphone aria-hidden className="size-3.5" />
          Approve from phone
        </button>
        <button
          type="button"
          aria-disabled={waitingOff || undefined}
          onClick={() => {
            if (!waitingOff) setLifetime(0);
          }}
          className={button}
        >
          <TimerOff aria-hidden className="size-3.5" />
          Expire now
        </button>
        <button
          type="button"
          onClick={() => {
            approveNext.current = false;
            restartChecks();
            setLifetime(LIFETIME);
            setNote({ kind: "waiting" });
            setRun((r) => r + 1);
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
        {line}
      </p>
    </div>
  );
}
