"use client";

import * as React from "react";

import {
  SendFlow,
  type SendRecipient,
  type SendStep,
} from "@/registry/ui/send-flow";

const RECIPIENTS: SendRecipient[] = [
  {
    id: "mara",
    name: "Mara Vance",
    handle: "@mara.v",
    tint: "var(--accent-bright)",
  },
  { id: "iyad", name: "Iyad Sorel", handle: "@sorel", tint: "var(--success)" },
  { id: "tomas", name: "Tomas Renn", handle: "@t.renn", tint: "var(--warn)" },
  {
    id: "priya",
    name: "Priya Okonkwo",
    handle: "@p.oko",
    tint: "var(--signal)",
  },
];

const BALANCE = 1284.5;

const money = (value: number) => `$${value.toFixed(2)}`;

export function SendFlowDemo() {
  const [step, setStep] = React.useState<SendStep>("who");
  const [payee, setPayee] = React.useState("");
  const [amount, setAmount] = React.useState(0);

  const chosen = RECIPIENTS.find((person) => person.id === payee);
  const stepIndex = ["who", "amount", "review"].indexOf(step);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SendFlow
        label="Send from Waylight Pay"
        recipients={RECIPIENTS}
        step={step}
        onStepChange={setStep}
        recipientId={payee}
        onRecipientChange={setPayee}
        amount={amount}
        onAmountChange={setAmount}
        balance={BALANCE}
        format={money}
        onSend={() => undefined}
      />

      <button
        type="button"
        onClick={() => {
          setStep("who");
          setPayee("");
          setAmount(0);
        }}
        className="flex h-8 items-center justify-center self-start rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Reset
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {step === "sent" ? (
          <>
            Sent <span className="text-signal">{money(amount)}</span> to{" "}
            <span className="text-signal">{chosen?.name ?? "no one"}</span>
          </>
        ) : (
          <>
            Step <span className="text-signal">{stepIndex + 1} of 3</span> · to{" "}
            <span className="text-signal">{chosen?.name ?? "unset"}</span> ·{" "}
            <span className="text-signal">{money(amount)}</span>
          </>
        )}
      </p>
    </div>
  );
}
