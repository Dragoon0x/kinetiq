"use client";

import * as React from "react";

import { BreadcrumbTrail, type Crumb } from "@/registry/ui/breadcrumb-trail";

const ITEMS: Crumb[] = [
  { id: "home", label: "Home", href: "#" },
  { id: "catalog", label: "Catalog", href: "#" },
  { id: "field", label: "Field Kit", href: "#" },
  { id: "sensors", label: "Sensors", href: "#" },
  { id: "a9", label: "Unit A-9" },
];

export function BreadcrumbTrailDemo() {
  const [last, setLast] = React.useState("—");

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <BreadcrumbTrail
        items={ITEMS}
        maxVisible={4}
        onNavigate={(crumb) => setLast(String(crumb.label))}
      />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Went to{" "}
        <span className="text-[var(--signal,var(--primary))]">{last}</span>
      </p>
    </div>
  );
}
