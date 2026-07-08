"use client";

import * as React from "react";

import { Callout } from "@/registry/ui/callout";

type Part = {
  id: string;
  label: string;
  content: string;
  side: "top" | "right" | "bottom";
  position: string;
  size: string;
};

const PARTS: Part[] = [
  {
    id: "coil",
    label: "Coil spring",
    content: "Coil — 316L stainless, k=640 N/m",
    side: "top",
    position: "left-[82px] top-[28px]",
    size: "h-[104px] w-[46px]",
  },
  {
    id: "damper",
    label: "Damper cylinder",
    content: "Damper — c=42 N·s/m",
    side: "right",
    position: "left-[139px] top-[60px]",
    size: "h-[62px] w-[32px]",
  },
  {
    id: "plate",
    label: "Base plate",
    content: "Base plate — anodized",
    side: "bottom",
    position: "left-[70px] top-[130px]",
    size: "h-[18px] w-[120px]",
  },
];

export function CalloutDemo() {
  const partRefs = React.useRef(new Map<string, HTMLSpanElement>());

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-muted-foreground font-mono text-xs">
        Spring assembly · SA-201
      </p>

      <div className="text-muted-foreground relative">
        <svg
          width={260}
          height={160}
          viewBox="0 0 260 160"
          aria-hidden
          className="block"
        >
          {/* plates */}
          <rect
            x={70}
            y={16}
            width={120}
            height={10}
            rx={1}
            className="fill-muted stroke-current"
            strokeWidth={1}
          />
          <rect
            x={70}
            y={134}
            width={120}
            height={10}
            rx={1}
            className="fill-muted stroke-current"
            strokeWidth={1}
          />
          {/* coil spring */}
          <polyline
            points="105,26 105,32 88,38 122,46 88,54 122,62 88,70 122,78 88,86 122,94 88,102 122,110 88,118 105,124 105,134"
            fill="none"
            className="stroke-current"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {/* damper: rod, piston head, open cylinder, lower link */}
          <line
            x1={155}
            y1={26}
            x2={155}
            y2={82}
            className="stroke-current"
            strokeWidth={1.5}
          />
          <line
            x1={148}
            y1={82}
            x2={162}
            y2={82}
            className="stroke-current"
            strokeWidth={1.5}
          />
          <path
            d="M145 68 V114 H165 V68"
            fill="none"
            className="stroke-current"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <line
            x1={155}
            y1={114}
            x2={155}
            y2={134}
            className="stroke-current"
            strokeWidth={1.5}
          />
        </svg>

        {PARTS.map((part) => (
          <div key={part.id} className={`absolute ${part.position}`}>
            <Callout
              ref={(node) => {
                if (node) partRefs.current.set(part.id, node);
                else partRefs.current.delete(part.id);
              }}
              content={part.content}
              side={part.side}
              tabIndex={0}
              role="img"
              aria-label={part.label}
            >
              <span
                className={`hover:bg-accent block cursor-crosshair rounded-1 ${part.size}`}
              />
            </Callout>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          const targets = Array.from(partRefs.current.values());
          const pick = targets[Math.floor(Math.random() * targets.length)];
          pick?.focus();
        }}
        className="border-input hover:bg-accent rounded-2 border px-3 py-1.5 text-xs font-medium"
      >
        Inspect randomly
      </button>
    </div>
  );
}
