"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  MailPostcard,
  type MailPostcardSide,
} from "@/registry/ui/mail-postcard";

export const tweaks = defineTweaks({
  hand: { kind: "toggle", label: "Handwriting", default: true },
  stamp: {
    kind: "choice",
    label: "Postmark",
    default: "round",
    options: ["round", "wave"],
    names: { round: "Round", wave: "Wave" },
  },
  paper: {
    kind: "choice",
    label: "Paper",
    default: "cream",
    options: ["cream", "white", "kraft"],
    names: { cream: "Cream", white: "White", kraft: "Kraft" },
  },
});

/** Coldbrook harbour at dawn: drawn inline, a few fixed pigments. */
function Harbour() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 200"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.72 0.07 300)" />
          <stop offset="0.55" stopColor="oklch(0.86 0.07 45)" />
          <stop offset="1" stopColor="oklch(0.93 0.06 80)" />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.66 0.06 300)" />
          <stop offset="1" stopColor="oklch(0.45 0.07 255)" />
        </linearGradient>
      </defs>
      <rect width="300" height="130" fill={`url(#${id}-sky)`} />
      <circle cx="206" cy="104" r="17" fill="oklch(0.97 0.11 88)" />
      <circle
        cx="206"
        cy="104"
        r="25"
        fill="oklch(0.97 0.11 88)"
        opacity="0.25"
      />
      <path
        d="M0 122 Q40 102 82 114 T166 108 T246 116 T300 106 V130 H0 Z"
        fill="oklch(0.6 0.05 295)"
      />
      <rect y="126" width="300" height="74" fill={`url(#${id}-sea)`} />
      <g fill="oklch(0.93 0.08 80)" opacity="0.75">
        <rect x="188" y="132" width="36" height="1.6" rx="0.8" />
        <rect x="194" y="138" width="24" height="1.6" rx="0.8" />
        <rect x="199" y="145" width="14" height="1.6" rx="0.8" />
        <rect x="202" y="152" width="8" height="1.4" rx="0.7" />
      </g>
      <g
        stroke="oklch(0.8 0.04 290)"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.5"
      >
        <path d="M118 150 h22 M250 142 h18 M84 170 h26 M236 178 h30" />
      </g>
      <path
        d="M0 134 Q26 116 58 120 Q84 124 104 140 L110 200 H0 Z"
        fill="oklch(0.36 0.04 265)"
      />
      <path d="M100 141 H150 V145 H104 Z" fill="oklch(0.3 0.03 265)" />
      <path d="M36 122 L38.8 86 H45.2 L48 122 Z" fill="oklch(0.96 0.015 85)" />
      <path
        d="M37.3 106 H46.7 L47.2 112 H36.8 Z M38.3 93 H45.7 L46 97.5 H38 Z"
        fill="oklch(0.56 0.17 27)"
      />
      <rect x="38.4" y="80" width="7.2" height="6" fill="oklch(0.93 0.09 85)" />
      <path d="M37.2 80 L42 74.5 L46.8 80 Z" fill="oklch(0.3 0.03 265)" />
      <path d="M142 156 H170 L165 162 H147 Z" fill="oklch(0.3 0.03 265)" />
      <path d="M156 155 V134 L168 154 Z" fill="oklch(0.97 0.01 85)" />
      <path d="M155 155 V138 L147 154 Z" fill="oklch(0.88 0.04 60)" />
      <g
        fill="none"
        stroke="oklch(0.38 0.04 280)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M222 62 l5 3 5 -3 M238 54 l4 2.6 4 -2.6" />
      </g>
    </svg>
  );
}

const DATE = "07 Oct 26";

/**
 * A card from Coldbrook in the Fernworks Post app, on its way to Ada in
 * Fernhill. In the gallery a posted card comes back after a moment so the
 * next visitor can post it too.
 */
export function MailPostcardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [side, setSide] = React.useState<MailPostcardSide>("front");
  const [sent, setSent] = React.useState(false);

  React.useEffect(() => {
    if (chrome || !sent) return;
    const timer = window.setTimeout(() => setSent(false), 2600);
    return () => window.clearTimeout(timer);
  }, [chrome, sent]);

  return (
    <div className="flex w-full max-w-[40rem] flex-col items-center gap-4">
      <MailPostcard
        message="The harbour at dawn is all pink water and gulls. Found the café you meant. Back on Sunday with the good bread."
        from="Mira"
        to={{ name: "Ada Fern", lines: ["4 Quay Row", "Fernhill FN2 7QA"] }}
        place="Coldbrook"
        date={DATE}
        caption="Greetings from Coldbrook"
        picture={<Harbour />}
        side={side}
        onSideChange={setSide}
        sent={sent}
        onSentChange={setSent}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex w-full flex-col items-center gap-3">
          {sent ? (
            <button
              type="button"
              onClick={() => setSent(false)}
              className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Write another
            </button>
          ) : null}
          <p
            role="status"
            className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {sent ? (
              <>
                <span className="text-signal">posted</span> · coldbrook · {DATE}
              </>
            ) : side === "back" ? (
              <>
                <span className="text-signal">message side</span> · ready to
                post
              </>
            ) : (
              <>
                <span className="text-signal">picture side</span> · turn it over
              </>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
