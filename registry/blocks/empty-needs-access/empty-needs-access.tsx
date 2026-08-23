"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type Approver = { id: string; name: string; role: string };

export type EmptyNeedsAccessProps = {
  headline?: string;
  copy?: string;
  /** What is being asked for, named exactly. */
  resource?: string;
  /** The permission required, in the system's own words. */
  permission?: string;
  /** Who can actually grant it. */
  approvers?: Approver[];
  cta?: string;
  onRequest?: () => void;
  /** What happens after the request, so nobody is left waiting blind. */
  afterLine?: string;
  className?: string;
};

const DEFAULT_APPROVERS: Approver[] = [
  { id: "a1", name: "Mara Aldana", role: "Yard owner, north basin" },
  { id: "a2", name: "Tobias Brekke", role: "Operations admin" },
];

/**
 * Locked out, without the dead end: it names the exact resource, the exact
 * permission missing, and — the part almost every access screen omits — the
 * people who can actually grant it, so the reader can act without opening a
 * support ticket. Requesting is one button, and the section says what happens
 * next rather than leaving anyone refreshing the page.
 */
export function EmptyNeedsAccess({
  headline = "You are not on this yard yet.",
  copy = "Your account is fine — it just has not been added to this one. Nothing here is hidden from you deliberately.",
  resource = "North Basin · morning board",
  permission = "yard.read",
  approvers = DEFAULT_APPROVERS,
  cta = "Ask for access",
  onRequest,
  afterLine = "They get one notification, not a daily reminder. Most requests are answered inside a shift.",
  className,
}: EmptyNeedsAccessProps) {
  const headingId = React.useId();
  const [asked, setAsked] = React.useState(false);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-lg px-6 py-20 sm:py-28">
        <div className="rounded-4 border border-hairline p-8">
          <StatusSeal variant="warn">no access</StatusSeal>

          <h2
            id={headingId}
            className="mt-5 text-2xl font-semibold tracking-tight text-balance"
          >
            {headline}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{copy}</p>

          <dl className="mt-6 flex flex-col gap-3 border-t border-hairline pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <dt className="text-label text-ink-3">Resource</dt>
              <dd className="min-w-0 font-mono text-xs text-ink">{resource}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <dt className="text-label text-ink-3">Permission needed</dt>
              <dd className="min-w-0 font-mono text-xs text-ink">
                {permission}
              </dd>
            </div>
          </dl>

          <div className="mt-5 border-t border-hairline pt-5">
            <p className="text-label text-ink-3">Who can grant it</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {approvers.map((approver) => (
                <li key={approver.id} className="min-w-0 text-sm">
                  <span className="text-ink">{approver.name}</span>
                  <span className="text-ink-3"> — {approver.role}</span>
                </li>
              ))}
            </ul>
          </div>

          <PressureButton
            onClick={() => {
              setAsked(true);
              onRequest?.();
            }}
            disabled={asked}
            className="mt-6 w-full"
          >
            {asked ? "Request sent" : cta}
          </PressureButton>
          <p
            role="status"
            className="mt-3 min-h-8 text-xs leading-relaxed text-ink-3"
          >
            {asked ? afterLine : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
