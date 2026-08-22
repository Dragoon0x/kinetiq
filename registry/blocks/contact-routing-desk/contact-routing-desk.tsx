"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type DeskRoute = {
  id: string;
  label: string;
  /** Who answers, stated plainly. */
  desk: string;
  /** The response expectation, stated before sending. */
  expectation: string;
  /** Extra field this route needs, if any. */
  extraField?: { label: string; placeholder?: string };
};

export type ContactRoutingDeskProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  routes?: DeskRoute[];
  onSubmit?: (routeId: string, fields: Record<string, string>) => void;
  className?: string;
};

const DEFAULT_ROUTES: DeskRoute[] = [
  {
    id: "support",
    label: "Something broke",
    desk: "Support engineering",
    expectation: "First reply within 4 working hours",
    extraField: { label: "Which bench or run", placeholder: "bench-04 / run #218" },
  },
  {
    id: "sales",
    label: "Buying questions",
    desk: "A person, not a sequence",
    expectation: "Reply within one working day",
  },
  {
    id: "security",
    label: "Security report",
    desk: "The security desk, directly",
    expectation: "Acknowledged within 24 hours, any day",
    extraField: { label: "Affected surface", placeholder: "API / agent / site" },
  },
];

/**
 * Contact as a routing desk: say why you are writing first, and the desk
 * answers with who will read it and how fast — the expectation stated before
 * the message is asked for, not promised after. The route picker is the
 * library's own segmented control; each route swaps in only the fields it
 * actually needs.
 */
export function ContactRoutingDesk({
  eyebrow = "Fieldline · contact",
  headline = "Say why, and we'll say who and when.",
  copy = "Every route lands with a person whose job it is. The response time is part of the form, so you know the deal before you write a word.",
  routes = DEFAULT_ROUTES,
  onSubmit,
  className,
}: ContactRoutingDeskProps) {
  const headingId = React.useId();
  const [routeId, setRouteId] = React.useState(routes[0]?.id ?? "");
  const route = routes.find((r) => r.id === routeId) ?? routes[0];
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [extra, setExtra] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message.trim()) return;
    onSubmit?.(route?.id ?? "", { email, message, extra });
    setSent(true);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-2xl px-6 py-20 sm:py-24">
        <div className="text-center">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mx-auto mt-4 max-w-lg leading-relaxed">{copy}</p>
        </div>

        {/* Long route labels scroll inside the rail on narrow screens —
            the page itself must never scroll sideways. */}
        <div className="mt-8 flex justify-center overflow-x-auto px-1 py-1">
          <SegmentedControl
            aria-label="Why are you writing?"
            value={routeId}
            onValueChange={(v) => {
              setRouteId(v);
              setSent(false);
            }}
          >
            {routes.map((r) => (
              <SegmentedControlItem key={r.id} value={r.id}>
                {r.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>

        {route && (
          <div className="border-hairline bg-surface-1 rounded-4 mt-6 border p-6 shadow-raised sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink text-sm font-medium">{route.desk}</p>
              <StatusSeal variant="info">{route.expectation}</StatusSeal>
            </div>

            {sent ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <StatusSeal variant="success">On its way</StatusSeal>
                <p className="text-ink-3 max-w-sm text-sm">
                  {route.desk} has it. {route.expectation.toLowerCase()} — the
                  clock started now.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
                <TraceInput
                  label="Your email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                {route.extraField && (
                  <TraceInput
                    key={route.id}
                    label={route.extraField.label}
                    placeholder={route.extraField.placeholder}
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                  />
                )}
                <div>
                  <label
                    htmlFor={`${headingId}-message`}
                    className="text-ink mb-1.5 block text-sm font-medium"
                  >
                    The message
                  </label>
                  <textarea
                    id={`${headingId}-message`}
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="border-input text-ink placeholder:text-ink-3 rounded-2 focus-visible:border-ring w-full resize-y border bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none"
                    placeholder="What happened, what you expected, and anything already tried."
                  />
                </div>
                <div className="flex justify-end">
                  <PressureButton type="submit">Send to {route.desk}</PressureButton>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
