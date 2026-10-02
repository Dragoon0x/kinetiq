"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SignIn, type SignInStep } from "@/registry/ui/sign-in";

export const tweaks = defineTweaks({
  steps: {
    kind: "choice",
    label: "Steps",
    default: "choose",
    options: ["choose", "code", "password"],
    names: { choose: "Choose", code: "Code", password: "Password" },
  },
  shake: {
    kind: "range",
    label: "Shake",
    default: 8,
    min: 0,
    max: 16,
    step: 2,
    unit: "px",
  },
  cells: {
    kind: "range",
    label: "Cells",
    default: 6,
    min: 4,
    max: 8,
    step: 2,
  },
});

const ACCOUNT = { name: "Mara Okafor", email: "mara@fernworks.app" };

/** Answers arrive after a fixed, believable wait: seeded, never random. */
const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const masked = (email: string) => {
  const at = email.indexOf("@");
  return at < 1 ? email : `${email.charAt(0)}•••${email.slice(at)}`;
};

/**
 * Signing in to Fernworks, a field-notes workspace, as Mara: by single
 * sign-on, a passkey, an emailed code or a password.
 */
export function SignInDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [step, setStep] = React.useState<SignInStep>("email");
  const [email, setEmail] = React.useState(ACCOUNT.email);
  const [note, setNote] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);

  const refuseOnce = (message: string) => {
    if (!failRef.current) return;
    failRef.current = false;
    setFailNext(false);
    throw new Error(message);
  };

  const card = (
    <SignIn
      key={round}
      brand="Fernworks"
      defaultEmail={ACCOUNT.email}
      onEmailChange={setEmail}
      onStepChange={(next) => {
        setStep(next);
        setNote(null);
      }}
      onEmailSubmit={() => wait(520)}
      onSendCode={() => wait(600)}
      onVerifyCode={async () => {
        await wait(700);
        try {
          refuseOnce("That code didn't match. Check the newest email.");
        } catch (error) {
          setNote("wrong code · try again");
          throw error;
        }
        return ACCOUNT;
      }}
      onVerifyPassword={async () => {
        await wait(650);
        try {
          refuseOnce("That password didn't match. Try again or use a code.");
        } catch (error) {
          setNote("wrong password · try again");
          throw error;
        }
        return ACCOUNT;
      }}
      onProvider={async (id) => {
        await wait(800);
        try {
          refuseOnce(
            id === "passkey"
              ? "That passkey wasn't accepted."
              : "Single sign-on was cancelled.",
          );
        } catch (error) {
          setNote(`${id} refused · nothing signed in`);
          throw error;
        }
        return ACCOUNT;
      }}
      onForgotPassword={(address) =>
        setNote(`reset link sent · ${masked(address)}`)
      }
      onCreateAccount={() => setNote("create account · opens sign-up")}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{card}</div>;

  const line =
    note ??
    (step === "email"
      ? `email · ${email || "enter a work email"}`
      : step === "method"
        ? "choose a method"
        : step === "code"
          ? `code sent · ${masked(email)}`
          : step === "password"
            ? `password · ${masked(email)}`
            : "signed in · welcome back, mara");

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      {card}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              const next = !failRef.current;
              failRef.current = next;
              setFailNext(next);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger/50 aria-pressed:text-danger"
          >
            Fail next
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setEmail(ACCOUNT.email);
              setNote(null);
              failRef.current = false;
              setFailNext(false);
              setRound((r) => r + 1);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
