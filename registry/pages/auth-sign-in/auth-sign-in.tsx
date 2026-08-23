"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type SsoProvider = { id: string; label: string };

export type AuthSignInProps = {
  wordmark?: string;
  headline?: string;
  /** Shown under the headline — what this account actually gets you. */
  copy?: string;
  sso?: SsoProvider[];
  /** Fired with the credentials; wire it to your own auth. */
  onSubmit?: (email: string, password: string) => void;
  onSso?: (id: string) => void;
  forgotHref?: string;
  signUpHref?: string;
  /** The line that stops people guessing, when sign-up is invite-only. */
  noAccountLine?: string;
  className?: string;
};

const DEFAULT_SSO: SsoProvider[] = [
  { id: "workspace", label: "Continue with your workspace" },
];

/**
 * Sign in, with the two things most sign-in pages get wrong put right: the
 * workspace route sits above the password rather than behind a second click,
 * and the page says plainly what to do if you have no account instead of
 * leaving the reader to guess whether sign-up exists.
 *
 * This is a shell. It collects nothing and authenticates nothing — wire
 * `onSubmit` and `onSso` to your own auth, and never post credentials from a
 * client component without a server action or an API route behind it.
 */
export function AuthSignIn({
  wordmark = "WAYLIGHT",
  headline = "Sign in.",
  copy = "One account per person, not per yard. If you work across several, you will pick one after this.",
  sso = DEFAULT_SSO,
  onSubmit,
  onSso,
  forgotHref = "/recover",
  signUpHref = "/sign-up",
  noAccountLine = "No account? Yards are invited by their owner — ask whoever runs yours, or write to us and we will find them.",
  className,
}: AuthSignInProps) {
  const headingId = React.useId();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit?.(email, password);
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

        {sso.length > 0 && (
          <>
            <div className="mt-8 flex flex-col gap-2">
              {sso.map((provider) => (
                <PressureButton
                  key={provider.id}
                  variant="outline"
                  onClick={() => onSso?.(provider.id)}
                  className="w-full"
                >
                  {provider.label}
                </PressureButton>
              ))}
            </div>
            <div className="my-6 flex items-center gap-3">
              <span aria-hidden className="h-px flex-1 bg-hairline" />
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                or with a password
              </span>
              <span aria-hidden className="h-px flex-1 bg-hairline" />
            </div>
          </>
        )}

        <form
          onSubmit={submit}
          aria-labelledby={headingId}
          className="flex flex-col gap-4"
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
          <div>
            <TraceInput
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <p className="mt-1.5 text-right">
              <a
                href={forgotHref}
                className="text-xs text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
              >
                Forgotten it?
              </a>
            </p>
          </div>
          <PressureButton type="submit" className="mt-2 w-full">
            Sign in
          </PressureButton>
        </form>

        <p className="mt-8 border-t border-hairline pt-6 text-xs leading-relaxed text-ink-3">
          {noAccountLine}{" "}
          <a
            href={signUpHref}
            className="underline underline-offset-4 transition-colors hover:text-ink"
          >
            Write to us
          </a>
          .
        </p>
      </div>
    </main>
  );
}
