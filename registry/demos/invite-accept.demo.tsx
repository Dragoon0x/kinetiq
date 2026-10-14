"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultInviteAccount,
  defaultInviteForm,
  InviteAccept,
  type InviteAccount,
  type InviteAccountState,
  type InviteForm,
  type InviteStatus,
} from "@/registry/ui/invite-accept";

export const tweaks = defineTweaks({
  cardStyle: {
    kind: "choice",
    label: "Finish",
    default: "card",
    options: ["card", "letter"],
    names: { card: "Card", letter: "Letter" },
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
    default: "cobalt",
    options: ["cobalt", "workspace", "ink"],
    names: { cobalt: "Cobalt", workspace: "Workspace", ink: "Ink" },
  },
});

const ACCOUNTS: { state: InviteAccountState; label: string }[] = [
  { state: "new", label: "No account" },
  { state: "existing", label: "Has account" },
  { state: "signed-in", label: "Signed in" },
  { state: "other", label: "Someone else" },
];

const accountFor = (state: InviteAccountState): InviteAccount =>
  state === "other"
    ? {
        state,
        current: {
          name: "Dev Okonkwo",
          email: "dev@basinworks.example",
          hue: 96,
        },
      }
    : { state };

/**
 * Ines Varga's invite to Coldbrook Design, forty-seven minutes from expiry:
 * create Rae's account and accept, watch her avatar join the strip, or
 * decline, let the join fail, or arrive signed in as someone else.
 */
export function InviteAcceptDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [form, setForm] = React.useState<InviteForm>(defaultInviteForm);
  const [account, setAccount] =
    React.useState<InviteAccount>(defaultInviteAccount);
  const [status, setStatus] = React.useState<InviteStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [outcome, setOutcome] = React.useState("waiting");
  const [epoch, setEpoch] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <InviteAccept height={540} {...values} />
      </div>
    );
  }

  const reload = (then?: () => void) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      then?.();
      setStatus("ready");
    }, 900);
  };

  const reset = () => {
    setForm(defaultInviteForm);
    setAccount(defaultInviteAccount);
    setFailNext(false);
    setOutcome("waiting");
    setEpoch((e) => e + 1);
    reload();
  };

  const choose = (state: InviteAccountState) => {
    setAccount(accountFor(state));
    setOutcome("waiting");
    setEpoch((e) => e + 1);
  };

  const button =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-hairline-strong aria-pressed:bg-surface-2 aria-pressed:text-foreground";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <InviteAccept
        key={epoch}
        height={560}
        value={form}
        onChange={setForm}
        account={account}
        acceptFails={failNext}
        onAcceptError={() => {
          setFailNext(false);
          setOutcome("join failed");
        }}
        onAccepted={() => setOutcome("joined as editor")}
        onContinue={() => setOutcome("continued to coldbrook")}
        onDecline={(_invite, reason) => setOutcome(`declined: ${reason}`)}
        onRequestInvite={() => setOutcome("new invite requested")}
        onSwitchAccount={() => {
          setOutcome("switched account");
          reload(() => setAccount({ state: "existing" }));
        }}
        status={status}
        onRetry={() => setStatus("ready")}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{outcome}</span> ·{" "}
          {ACCOUNTS.find((a) => a.state === account.state)?.label.toLowerCase()}
          {failNext ? " · next join fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Account state"
            className="flex flex-wrap items-center gap-1"
          >
            {ACCOUNTS.map((a) => (
              <button
                key={a.state}
                type="button"
                onClick={() => choose(a.state)}
                aria-pressed={account.state === a.state}
                className={button}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={button}
          >
            Fail next join
          </button>
          <button type="button" onClick={reset} className={button}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
