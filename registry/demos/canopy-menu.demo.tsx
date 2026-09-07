"use client";

import * as React from "react";

import { CanopyMenu, type CanopyItem } from "@/registry/ui/canopy-menu";

const ITEMS: CanopyItem[] = [
  {
    id: "product",
    label: "Product",
    columns: [
      {
        heading: "Build",
        links: [
          { label: "Editor", href: "#fernworks-editor" },
          { label: "Templates", href: "#fernworks-templates" },
          { label: "Components", href: "#fernworks-components" },
        ],
      },
      {
        heading: "Ship",
        links: [
          { label: "Previews", href: "#fernworks-previews" },
          { label: "Releases", href: "#fernworks-releases" },
        ],
      },
    ],
  },
  {
    id: "solutions",
    label: "Solutions",
    columns: [
      {
        heading: "Teams",
        links: [
          { label: "Design", href: "#fernworks-design" },
          { label: "Marketing", href: "#fernworks-marketing" },
          { label: "Support", href: "#fernworks-support" },
        ],
      },
      {
        heading: "Industry",
        links: [
          { label: "Retail", href: "#fernworks-retail" },
          { label: "Logistics", href: "#fernworks-logistics" },
        ],
      },
      {
        heading: "Scale",
        links: [
          { label: "Agencies", href: "#fernworks-agencies" },
          { label: "Enterprise", href: "#fernworks-enterprise" },
        ],
      },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    columns: [
      {
        heading: "Learn",
        links: [
          { label: "Guides", href: "#fernworks-guides" },
          { label: "Changelog", href: "#fernworks-changelog" },
        ],
      },
      {
        heading: "Talk",
        links: [
          { label: "Forum", href: "#fernworks-forum" },
          { label: "Contact", href: "#fernworks-contact" },
        ],
      },
    ],
  },
];

export function CanopyMenuDemo() {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const openLabel = ITEMS.find((item) => item.id === openId)?.label;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="relative h-[300px] w-full overflow-hidden rounded-3 border border-hairline bg-surface-0 p-3">
        <CanopyMenu items={ITEMS} label="Fernworks" onOpenChange={setOpenId} />

        <div className="mt-4 px-1">
          <p className="text-label text-ink-3">Fernworks</p>
          <h4 className="mt-1 text-base font-semibold text-foreground">
            Rope, timber, and the software that tracks both
          </h4>
          <p className="mt-2 text-xs leading-5 text-ink-2">
            Hover or focus an item in the bar. The panel keeps its identity and
            resizes to whatever the next item holds.
          </p>
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Panel <span className="text-signal">{openLabel ?? "closed"}</span>
      </p>
    </div>
  );
}
