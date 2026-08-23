"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type ErrorLinkExpiredProps = {
  headline?: string;
  copy?: string;
  /** What kind of link it was, so the reader knows what to ask for again. */
  linkKind?: string;
  /** Why it expires at all — the reassurance that this is by design. */
  whyLine?: string;
  cta?: string;
  onResend?: () => void;
  sentLine?: string;
  signInHref?: string;
  className?: string;
};

/**
 * An expired one-time link, which is a success rather than a failure and
 * should read like one: the link did exactly what it was built to do. The
 * page says which kind of link it was, why it expires, and offers a new one
 * in a single press — because the reader is holding a dead link and wants
 * another, not an explanation of tokens.
 */
export function ErrorLinkExpired({
  headline = "That link has expired.",
  copy = "It worked once or it ran out of time, and either way it will not work again. That is the point of it.",
  linkKind = "Password reset link",
  whyLine = "One-time links last an hour. If they lasted longer, an old email in a forwarded thread would be a way into your account.",
  cta = "Send me a new one",
  onResend,
  sentLine = "On its way. The new link lasts an hour from now.",
  signInHref = "/sign-in",
  className,
}: ErrorLinkExpiredProps) {
  const headingId = React.useId();
  const [sent, setSent] = React.useState(false);

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-md">
        <StatusSeal variant="warn">expired</StatusSeal>
        <h1
          id={headingId}
          className="mt-5 text-3xl font-semibold tracking-tight text-balance text-ink"
        >
          {headline}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-2">{copy}</p>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-y border-hairline py-4">
          <span className="text-label text-ink-3">What it was</span>
          <span className="min-w-0 text-sm text-ink">{linkKind}</span>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-3">{whyLine}</p>

        <PressureButton
          onClick={() => {
            setSent(true);
            onResend?.();
          }}
          disabled={sent}
          className="mt-8 w-full"
        >
          {sent ? "Sent" : cta}
        </PressureButton>
        <p role="status" className="mt-3 min-h-4 text-xs text-ink-3">
          {sent ? sentLine : ""}
        </p>

        <p className="mt-6 text-xs text-ink-3">
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
