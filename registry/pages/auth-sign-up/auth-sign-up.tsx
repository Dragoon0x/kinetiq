"use client";

import * as React from "react";

import { Check } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type AuthSignUpProps = {
  wordmark?: string;
  headline?: string;
  copy?: string;
  /** Exactly what creating this account does — and does not — do. */
  creates?: string[];
  /** What lands in the inbox, said before the button is pressed. */
  nextLine?: string;
  termsHref?: string;
  privacyHref?: string;
  signInHref?: string;
  onSubmit?: (name: string, email: string, password: string) => void;
  className?: string;
};

const DEFAULT_CREATES = [
  "One free yard, with no card and no trial clock",
  "An export you can take whenever you like",
  "Nothing shared with anyone until you invite them",
];

/**
 * Sign up that says what it is about to create before it creates it: the
 * three things this account gets you, the one email that will arrive, and no
 * trial countdown — because a page that hides the terms until after the
 * password has already spent the goodwill it needed.
 *
 * This is a shell. It creates nothing — wire `onSubmit` to your own auth, and
 * never handle credentials from a client component without a server action or
 * an API route behind it.
 */
export function AuthSignUp({
  wordmark = "WAYLIGHT",
  headline = "Start one yard.",
  copy = "Free indefinitely for a single yard. The paid tiers exist for people running several.",
  creates = DEFAULT_CREATES,
  nextLine = "One email arrives, with a link that expires in an hour. Nothing else — we do not run a welcome sequence.",
  termsHref = "/terms",
  privacyHref = "/privacy",
  signInHref = "/sign-in",
  onSubmit,
  className,
}: AuthSignUpProps) {
  const headingId = React.useId();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit?.(name, email, password);
  };

  return (
    <main
      className={cn("grid min-h-screen bg-surface-0 lg:grid-cols-2", className)}
    >
      <div className="flex items-center justify-center px-6 py-16">
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
              label="Your name"
              name="name"
              autoComplete="name"
              placeholder="Mara Aldana"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <TraceInput
              label="Work email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@yard.example"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <TraceInput
              label="Password"
              type="password"
              name="password"
              autoComplete="new-password"
              description="Twelve characters or more. We check it against known breaches and nothing else."
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <PressureButton type="submit" className="mt-2 w-full">
              Create the account
            </PressureButton>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-ink-3">{nextLine}</p>

          <p className="mt-6 text-xs leading-relaxed text-ink-3">
            Creating it accepts our{" "}
            <a
              href={termsHref}
              className="underline underline-offset-4 transition-colors hover:text-ink"
            >
              terms
            </a>{" "}
            and{" "}
            <a
              href={privacyHref}
              className="underline underline-offset-4 transition-colors hover:text-ink"
            >
              privacy notice
            </a>
            . Already have one?{" "}
            <a
              href={signInHref}
              className="underline underline-offset-4 transition-colors hover:text-ink"
            >
              Sign in
            </a>
            .
          </p>
        </div>
      </div>

      {/* The other half states the bargain, so it is read before the button
          and not discovered after it. */}
      <aside className="hidden items-center justify-center border-l border-hairline bg-surface-1 px-6 py-16 lg:flex">
        <div className="w-full max-w-sm">
          <p className="text-label text-ink-3">What this creates</p>
          <ul className="mt-4 flex flex-col gap-3">
            {creates.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-2"
              >
                <Check
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-[var(--success,var(--primary))]"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
