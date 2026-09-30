"use client";

import * as React from "react";

import { Bell, SlidersHorizontal, TriangleAlert, User } from "lucide-react";

import { Slipstream, SlipstreamItem } from "@/registry/ui/slipstream";

const DOCS = [
  { label: "Overview", href: "#overview" },
  { label: "Instruments", href: "#instruments" },
  { label: "Assemblies", href: "#assemblies" },
  { label: "Field manual", href: "#field-manual" },
] as const;

const SETTINGS = [
  { label: "Profile", icon: User },
  { label: "Notifications", icon: Bell },
  { label: "Calibration", icon: SlidersHorizontal },
] as const;

export function SlipstreamDemo() {
  return (
    <div className="flex w-[400px] max-w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          Docs
        </span>
        <nav aria-label="Documentation">
          <Slipstream className="flex items-center gap-1 border-b border-border pb-1.5">
            {DOCS.map((link) => (
              <SlipstreamItem key={link.href}>
                <a
                  href={link.href}
                  onClick={(event) => event.preventDefault()}
                  className="block rounded-2 px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                >
                  {link.label}
                </a>
              </SlipstreamItem>
            ))}
          </Slipstream>
        </nav>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          Settings
        </span>
        <Slipstream className="flex flex-col gap-0.5 rounded-3 border border-border bg-card p-1.5">
          {SETTINGS.map((row) => (
            <SlipstreamItem key={row.label}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-2 px-2.5 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <row.icon className="size-4 opacity-70" aria-hidden />
                {row.label}
              </button>
            </SlipstreamItem>
          ))}
          <hr className="mx-2 my-1 border-border" />
          <SlipstreamItem>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-2 px-2.5 py-2 text-left text-sm font-medium text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              <TriangleAlert className="size-4 opacity-70" aria-hidden />
              Danger zone
            </button>
          </SlipstreamItem>
        </Slipstream>
      </div>

      <p className="text-center font-mono text-xs text-muted-foreground">
        Hover or Tab through
      </p>
    </div>
  );
}
