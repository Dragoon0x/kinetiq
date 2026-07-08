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
        <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
          Docs
        </span>
        <nav aria-label="Documentation">
          <Slipstream className="border-border flex items-center gap-1 border-b pb-1.5">
            {DOCS.map((link) => (
              <SlipstreamItem key={link.href}>
                <a
                  href={link.href}
                  onClick={(event) => event.preventDefault()}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-ring block rounded-2 px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {link.label}
                </a>
              </SlipstreamItem>
            ))}
          </Slipstream>
        </nav>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
          Settings
        </span>
        <Slipstream className="border-border bg-card flex flex-col gap-0.5 rounded-3 border p-1.5">
          {SETTINGS.map((row) => (
            <SlipstreamItem key={row.label}>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground focus-visible:outline-ring flex w-full items-center gap-2.5 rounded-2 px-2.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <row.icon className="size-4 opacity-70" aria-hidden />
                {row.label}
              </button>
            </SlipstreamItem>
          ))}
          <hr className="border-border mx-2 my-1" />
          <SlipstreamItem>
            <button
              type="button"
              className="text-destructive focus-visible:outline-ring flex w-full items-center gap-2.5 rounded-2 px-2.5 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <TriangleAlert className="size-4 opacity-70" aria-hidden />
              Danger zone
            </button>
          </SlipstreamItem>
        </Slipstream>
      </div>

      <p className="text-muted-foreground text-center font-mono text-xs">
        Hover or Tab through
      </p>
    </div>
  );
}
