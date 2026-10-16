"use client";

import * as React from "react";

import { Link2Off, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultResetMatchRules,
  ResetMatch,
  type ResetMatchCheck,
  type ResetMatchStatus,
} from "@/registry/ui/reset-match";

export const tweaks = defineTweaks({
  lineStyle: {
    kind: "choice",
    label: "Joints",
    default: "line",
    options: ["line", "stitch", "capsule"],
    names: { line: "Line", stitch: "Stitch", capsule: "Capsule" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
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

/** The password this account used last spring: typing it again is refused. */
const PREVIOUS = "Fernworks-2025!";
/** Ines is part-way through: the new password typed, the confirmation begun. */
const TYPED = "Harbour-lights-42";
const BEGUN = "Harbour-li";

type Note =
  | { kind: "check"; check: ResetMatchCheck | null }
  | { kind: "refused" }
  | { kind: "updated" }
  | { kind: "expired" }
  | { kind: "sent" }
  | { kind: "back" };

/**
 * Ines followed the reset link from her Fernworks email. The demo's server
 * remembers one old password and refuses it; anything else is saved after a
 * short round trip.
 */
export function ResetMatchDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [status, setStatus] = React.useState<ResetMatchStatus>("ready");
  const [note, setNote] = React.useState<Note>({ kind: "check", check: null });

  const reset = () => {
    setStatus("ready");
    setNote({ kind: "check", check: null });
    setRun((r) => r + 1);
  };

  const surface = (
    <ResetMatch
      key={run}
      status={status}
      defaultPassword={TYPED}
      defaultConfirm={BEGUN}
      onCheck={(check) => setNote({ kind: "check", check })}
      isReused={(password) =>
        new Promise<boolean>((resolve) => {
          window.setTimeout(() => {
            const reused = password === PREVIOUS;
            if (reused) setNote({ kind: "refused" });
            resolve(reused);
          }, 450);
        })
      }
      onSubmit={() =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            setNote({ kind: "updated" });
            resolve();
          }, 900);
        })
      }
      onContinue={reset}
      onCancel={() => setNote({ kind: "back" })}
      onResend={() => {
        setStatus("ready");
        setNote({ kind: "sent" });
        setRun((r) => r + 1);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const total = defaultResetMatchRules.length;
  const line = (() => {
    switch (note.kind) {
      case "refused":
        return (
          <>
            <span className="text-signal">refused</span> · used before on this
            account
          </>
        );
      case "updated":
        return (
          <>
            <span className="text-signal">updated</span> · other devices sign in
            again
          </>
        );
      case "expired":
        return (
          <>
            <span className="text-signal">link expired</span> · offering a new
            one
          </>
        );
      case "sent":
        return (
          <>
            <span className="text-signal">new link sent</span> · form is fresh
          </>
        );
      case "back":
        return (
          <>
            <span className="text-signal">back to sign in</span> · nothing
            changed
          </>
        );
      default: {
        const c = note.check;
        if (!c) {
          return (
            <>
              <span className="text-signal">
                {total} of {total} rules
              </span>{" "}
              · matches {BEGUN.length} of {TYPED.length}
            </>
          );
        }
        if (c.length === 0) {
          return (
            <>
              <span className="text-signal">0 of {total} rules</span> · type it
              twice
            </>
          );
        }
        return (
          <>
            <span className="text-signal">
              {c.met.length} of {total} rules
            </span>{" "}
            ·{" "}
            {c.confirmLength === 0
              ? "confirm empty"
              : c.ready
                ? "matches · ready"
                : c.differsAt !== null
                  ? `differs at ${c.differsAt}`
                  : `matches ${c.matched} of ${c.length}`}
          </>
        );
      }
    }
  })();

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          aria-pressed={status === "error"}
          onClick={() => {
            const next = status === "error" ? "ready" : "error";
            setStatus(next);
            setNote(
              next === "error"
                ? { kind: "expired" }
                : { kind: "check", check: null },
            );
            // A fresh link is a fresh form.
            if (next === "ready") setRun((r) => r + 1);
          }}
          className={cn(
            button,
            status === "error" && "border-warn/50 text-warn hover:text-warn",
          )}
        >
          <Link2Off aria-hidden className="size-3.5" />
          Expired link
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <p className="text-xs text-ink-3">
          Used before: <code className="font-mono text-ink-2">{PREVIOUS}</code>
        </p>
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
