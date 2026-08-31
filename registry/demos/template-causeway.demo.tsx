"use client";

import * as React from "react";

import { motion } from "motion/react";

import { CausewayHome } from "@/registry/templates/template-causeway/home";
import { CausewayChangelog } from "@/registry/templates/template-causeway/changelog";
import { CausewayPricing } from "@/registry/templates/template-causeway/pricing";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const ROUTES = [
  { id: "home", label: "/", render: () => <CausewayHome /> },
  { id: "changelog", label: "/changelog", render: () => <CausewayChangelog /> },
  { id: "pricing", label: "/pricing", render: () => <CausewayPricing /> },
] as const;

/**
 * All three routes of the site, flipped through a demo-only switcher — the
 * installed template navigates with real hrefs instead.
 */
export function TemplateCausewayDemo() {
  const motionSafe = useMotionSafe();
  const [routeId, setRouteId] =
    React.useState<(typeof ROUTES)[number]["id"]>("home");

  const route = ROUTES.find((r) => r.id === routeId) ?? ROUTES[0];

  return (
    <div className="relative">
      <div
        role="tablist"
        aria-label="Template route"
        // Above the template's own sticky nav (z-40) and clear of its bar,
        // so both stay clickable while the routes flip beneath.
        className="sticky top-20 z-50 mx-auto flex w-fit rounded-full border border-hairline bg-surface-1/95 p-1 shadow-raised backdrop-blur"
      >
        {ROUTES.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={routeId === r.id}
            onClick={() => setRouteId(r.id)}
            className={cn(
              "relative rounded-full px-3 py-1 font-mono text-[11px] transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
              routeId === r.id ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {routeId === r.id && (
              <motion.span
                layoutId="causeway-route"
                aria-hidden
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className="absolute inset-0 rounded-full border border-hairline bg-surface-2"
              />
            )}
            <span className="relative">{r.label}</span>
          </button>
        ))}
      </div>
      <div className="-mt-9">{route.render()}</div>
    </div>
  );
}
