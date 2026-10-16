"use client";

import * as React from "react";

import { Hourglass, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultInvite,
  defaultInviteNow,
  InviteAccept,
} from "@/registry/ui/invite-accept";

export const tweaks = defineTweaks({
  cardStyle: {
    kind: "choice",
    label: "Card",
    default: "plain",
    options: ["plain", "ticket", "pass"],
    names: { plain: "Plain", ticket: "Ticket", pass: "Pass" },
  },
  flipAxis: {
    kind: "choice",
    label: "Turn",
    default: "y",
    options: ["y", "x"],
    names: { y: "Sideways", x: "Over" },
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

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const DAY = 86_400_000;
const EXPIRED = {
  ...defaultInvite,
  sentAt: defaultInviteNow - 9 * DAY,
  expiresAt: defaultInviteNow - 2 * DAY,
};

/**
 * Mara Lindqvist invites Theo Barros to Basinworks as an editor. The first
 * join is refused so the error has somewhere to stay; the second goes
 * through. In the gallery the card starts over a few seconds after it ends.
 */
export function InviteAcceptDemo({
  chrome = true,
  // The landing is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [expired, setExpired] = React.useState(false);
  const [note, setNote] = React.useState("invite open · editor");
  const attempts = React.useRef(0);
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reset = (nextExpired = expired) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    attempts.current = 0;
    setExpired(nextExpired);
    setNote(
      nextExpired ? "invite expired · ask again" : "invite open · editor",
    );
    setRound((r) => r + 1);
  };
  const loopSoon = () => {
    if (chrome) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => reset(false), 4000);
  };

  const surface = (
    <InviteAccept
      key={round}
      invite={expired ? EXPIRED : defaultInvite}
      now={defaultInviteNow}
      onSideChange={(side) =>
        setNote(
          side === "back" ? "turned · sign-up form" : "turned back · invite",
        )
      }
      onAccept={async () => {
        attempts.current += 1;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        if (attempts.current === 1) {
          setNote("join failed · kept on form");
          throw new Error(
            "Basinworks didn't answer. Your details are still here.",
          );
        }
        setNote("joined as editor");
        loopSoon();
      }}
      onDecline={() => {
        setNote("declined · mara told");
        loopSoon();
      }}
      onRequestNew={() => {
        setNote("asked mara again");
        loopSoon();
      }}
      onSignIn={() => setNote("sign in instead")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS,
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => reset()} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <button
          type="button"
          aria-pressed={expired}
          onClick={() => reset(!expired)}
          className={cn(button, expired && "bg-surface-2 text-foreground")}
        >
          <Hourglass aria-hidden className="size-3.5" />
          Expired invite
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note}</span> · Basinworks
      </p>
    </div>
  );
}
