"use client";

import * as React from "react";

import { SlidersHorizontal } from "lucide-react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/registry/ui/drawer";

const FILTERS = [
  { id: "in-cal", label: "In calibration" },
  { id: "overdue", label: "Service overdue" },
  { id: "idle", label: "Idle > 30 days" },
] as const;

export function DrawerDemo() {
  const [active, setActive] = React.useState<string[]>(["in-cal"]);

  const toggle = (id: string) =>
    setActive((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );

  return (
    <div className="border-border bg-background relative h-[380px] w-full max-w-md overflow-hidden rounded-3 border">
      {/* fake results surface */}
      <div className="grid grid-cols-3 gap-2 p-4">
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className="bg-card border-border h-16 rounded-2 border"
          />
        ))}
      </div>
      <p className="text-muted-foreground px-4 font-mono text-[11px] tracking-wide uppercase">
        {active.length} filter{active.length === 1 ? "" : "s"} active
      </p>

      <Drawer portal={false} size="sm">
        <DrawerTrigger className="border-input bg-card hover:bg-accent absolute top-3 right-3 flex items-center gap-1.5 rounded-2 border px-2.5 py-1.5 text-xs font-medium transition-colors">
          <SlidersHorizontal aria-hidden className="size-3.5" />
          Filters
        </DrawerTrigger>
        <DrawerContent className="max-w-[85%]">
          <div className="flex items-start justify-between gap-2">
            <DrawerTitle>Bench filters</DrawerTitle>
            <DrawerClose
              aria-label="Close filters"
              className="text-muted-foreground hover:text-foreground rounded-1 p-1 transition-colors"
            />
          </div>
          <DrawerDescription>
            Narrow the rig list. Drag the panel edge to dismiss.
          </DrawerDescription>
          <div className="mt-2 space-y-1.5">
            {FILTERS.map((filter) => {
              const on = active.includes(filter.id);
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(filter.id)}
                  className={
                    on
                      ? "border-primary bg-primary/10 text-foreground w-full rounded-2 border px-3 py-2 text-left text-sm font-medium"
                      : "border-input text-muted-foreground hover:text-foreground w-full rounded-2 border px-3 py-2 text-left text-sm transition-colors"
                  }
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
