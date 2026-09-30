"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { UnderlinePeek } from "@/registry/ui/underline-peek";

export const tweaks = defineTweaks({
  delay: {
    kind: "range",
    label: "Delay",
    default: 300,
    min: 0,
    max: 800,
    step: 50,
    unit: "ms",
  },
  follow: { kind: "toggle", label: "Follow", default: true },
  width: {
    kind: "range",
    label: "Width",
    default: 280,
    min: 220,
    max: 360,
    step: 20,
    unit: "px",
  },
  stiffness: {
    kind: "choice",
    label: "Stiffness",
    default: "firm",
    options: ["soft", "firm"],
    names: { soft: "Soft", firm: "Firm" },
  },
});

type Topic = "reconciliation" | "cut-off time";

const PREVIEWS: Record<Topic, { title: string; meta: string; body: string }> = {
  reconciliation: {
    title: "Reconciliation",
    meta: "3 min",
    body: "How each payout is matched to the card sales behind it.",
  },
  "cut-off time": {
    title: "Cut-off times",
    meta: "1 min",
    body: "The last minute a sale can join tonight’s payout.",
  },
};

function Preview({ topic }: { topic: Topic }) {
  const p = PREVIEWS[topic];
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3">
        <span
          title={p.title}
          className="min-w-0 truncate text-[13px] font-medium text-foreground"
        >
          {p.title}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {p.meta}
        </span>
      </span>
      <span className="block text-xs leading-4 text-ink-2">{p.body}</span>
    </span>
  );
}

/**
 * A Waylight Pay help article. Both links carry a preview; the article is
 * the preview's boundary, so a card never leaves it. Following a link is
 * recorded here instead of navigating.
 */
export function UnderlinePeekDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [article, setArticle] = React.useState<HTMLElement | null>(null);
  const [showing, setShowing] = React.useState<Topic | null>(null);
  const [followed, setFollowed] = React.useState<Topic | null>(null);

  const linkProps = (topic: Topic) => ({
    href: `#${topic.replace(" ", "-")}`,
    preview: <Preview topic={topic} />,
    boundary: article,
    onOpenChange: (open: boolean) =>
      setShowing((current) =>
        open ? topic : current === topic ? null : current,
      ),
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      setFollowed(topic);
    },
    sound,
    ...values,
  });

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <article ref={setArticle} aria-label="Waylight Pay help: payouts">
        <p className="text-sm leading-6 text-ink-2">
          The{" "}
          <UnderlinePeek {...linkProps("cut-off time")}>
            cut-off time
          </UnderlinePeek>{" "}
          and{" "}
          <UnderlinePeek {...linkProps("reconciliation")}>
            reconciliation
          </UnderlinePeek>{" "}
          decide when a Waylight Pay payout lands. Every payout is matched to
          the card sales behind it before it leaves, so the sum in your bank is
          the sum on your statement. Sales taken after the cut-off roll into the
          next night’s payout and show as pending until then, each one listing
          the sales it covers.
        </p>
      </article>
      {chrome ? (
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {showing ? (
            <>
              <span className="text-signal">preview · {showing}</span> · open
            </>
          ) : followed ? (
            <>
              <span className="text-signal">followed · {followed}</span> · kept
              on this page
            </>
          ) : (
            "hover or focus a link"
          )}
        </p>
      ) : null}
    </div>
  );
}
