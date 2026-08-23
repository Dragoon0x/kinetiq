"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type AuthSecondFactorProps = {
  wordmark?: string;
  headline?: string;
  /** Which device or app is expected, so the reader knows where to look. */
  copy?: string;
  /** How many digits the code has. */
  length?: number;
  /** The recovery path, given equal weight rather than buried. */
  recoveryLabel?: string;
  recoveryCopy?: string;
  recoveryHref?: string;
  onSubmit?: (code: string) => void;
  className?: string;
};

/**
 * The second factor, with the lost-device path given the same weight as the
 * code field. Almost every 2FA screen buries recovery in small grey text at
 * the bottom, which is precisely where nobody looks while holding a dead
 * phone — so here it is a stated option with its own heading.
 *
 * This is a shell. It verifies nothing; wire `onSubmit` to your own auth.
 * Codes are validated for shape only — never treat that as verification.
 */
export function AuthSecondFactor({
  wordmark = "WAYLIGHT",
  headline = "Enter the code.",
  copy = "Six digits from your authenticator app. It changes every thirty seconds, so use whichever one is on screen now.",
  length = 6,
  recoveryLabel = "Lost the device?",
  recoveryCopy = "Use one of the recovery codes you saved when you set this up. Each works once. If those are gone too, your yard owner can reset it for you.",
  recoveryHref = "/recover-2fa",
  onSubmit,
  className,
}: AuthSecondFactorProps) {
  const headingId = React.useId();
  const [code, setCode] = React.useState("");

  // Shape only — digits and length. This is not verification and must never
  // be mistaken for it.
  const wellFormed = new RegExp(`^\\d{${length}}$`).test(code);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!wellFormed) return;
    onSubmit?.(code);
  };

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-sm">
        <p className="font-mono text-[11px] tracking-[0.18em] text-ink-3">
          {wordmark}
        </p>
        <h1
          id={headingId}
          className="mt-6 text-3xl font-semibold tracking-tight text-ink"
        >
          {headline}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{copy}</p>

        <form
          onSubmit={submit}
          aria-labelledby={headingId}
          className="mt-8 flex flex-col gap-4"
        >
          <TraceInput
            label={`${length}-digit code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`\\d{${length}}`}
            maxLength={length}
            placeholder={"0".repeat(length)}
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, length))
            }
            className="[&_input]:font-mono [&_input]:tracking-[0.4em]"
            required
          />
          <PressureButton
            type="submit"
            disabled={!wellFormed}
            className="w-full"
          >
            Verify
          </PressureButton>
        </form>

        {/* Recovery is a stated option, not a footnote — nobody reads grey
            small print while holding a dead phone. */}
        <section className="mt-8 rounded-4 border border-hairline bg-surface-1 p-5">
          <h2 className="font-medium text-ink">{recoveryLabel}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            {recoveryCopy}
          </p>
          <a
            href={recoveryHref}
            className="mt-3 inline-block text-sm text-ink-2 underline underline-offset-4 transition-colors hover:text-ink"
          >
            Use a recovery code
          </a>
        </section>
      </div>
    </main>
  );
}
