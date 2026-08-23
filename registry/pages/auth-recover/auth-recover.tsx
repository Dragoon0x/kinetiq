"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type AuthRecoverProps = {
  wordmark?: string;
  headline?: string;
  copy?: string;
  /** The line explaining why the response is identical either way. */
  privacyNote?: string;
  /** What the sent state says — deliberately not "we found your account". */
  sentHeadline?: string;
  sentCopy?: string;
  signInHref?: string;
  onSubmit?: (email: string) => void;
  className?: string;
};

/**
 * Password recovery that refuses to leak. The response is identical whether
 * or not the address has an account, and — unusually — the page says so out
 * loud, because a reader who does not understand why they got a vague answer
 * assumes the form is broken and tries again.
 *
 * This is a shell. It sends nothing; wire `onSubmit` to your own auth, and
 * keep the identical response on the server too — a page that is careful in
 * the UI and chatty in the API has leaked anyway.
 */
export function AuthRecover({
  wordmark = "WAYLIGHT",
  headline = "Reset your password.",
  copy = "Give us the address you sign in with and we will send a link that works once and expires in an hour.",
  privacyNote = "We will say the same thing whether or not that address has an account — otherwise this form would tell anyone who asked which of your colleagues works here.",
  sentHeadline = "If that address has an account, the link is on its way.",
  sentCopy = "It expires in an hour and can only be used once. Nothing has changed on the account yet — the link is what changes it.",
  signInHref = "/sign-in",
  onSubmit,
  className,
}: AuthRecoverProps) {
  const headingId = React.useId();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    onSubmit?.(email.trim());
    setSent(true);
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

        {sent ? (
          <div role="status">
            <StatusSeal variant="success" className="mt-6">
              sent
            </StatusSeal>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-balance text-ink">
              {sentHeadline}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              {sentCopy}
            </p>
            <PressureButton
              variant="outline"
              onClick={() => setSent(false)}
              className="mt-6 w-full"
            >
              Use a different address
            </PressureButton>
          </div>
        ) : (
          <>
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
                label="Email"
                type="email"
                name="email"
                autoComplete="username"
                placeholder="you@yard.example"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <PressureButton type="submit" className="w-full">
                Send the link
              </PressureButton>
            </form>

            <p className="mt-5 text-xs leading-relaxed text-ink-3">
              {privacyNote}
            </p>
          </>
        )}

        <p className="mt-8 border-t border-hairline pt-6 text-xs text-ink-3">
          <a
            href={signInHref}
            className="underline underline-offset-4 transition-colors hover:text-ink"
          >
            Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}
