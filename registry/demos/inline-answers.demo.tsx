"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  answerQuery,
  defaultAnswerProviders,
  InlineAnswers,
  type AnswerProvider,
} from "@/registry/ui/inline-answers";

export const tweaks = defineTweaks({
  answerSize: {
    kind: "range",
    label: "Size",
    default: 32,
    min: 24,
    max: 44,
    step: 4,
    unit: "px",
  },
  rollSpeed: {
    kind: "range",
    label: "Roll",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/** Fieldline's route planner is offline today: asking it shows the error state. */
const routes: AnswerProvider = {
  id: "routes",
  label: "The route planner",
  answer: (query) => {
    if (/^(route|drive|distance)\b/i.test(query.trim())) {
      throw new Error("Route planner offline");
    }
    return null;
  },
};
const PROVIDERS = [...defaultAnswerProviders, routes];

const START = "12 km × 3";
const TYPED = " + 450 m";
const EXAMPLES = [
  "26 mi",
  "today + 45 days",
  "3pm Lisbon in Tokyo",
  "12/03 + 10 days",
  "route to Site 4",
];

/**
 * The Fieldline field office's palette, open on a sum. When it first comes
 * into view it finishes typing the sum itself, so the digits roll through
 * every intermediate answer; the chips under it try the other kinds.
 */
export function InlineAnswersDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The palette is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [query, setQuery] = React.useState(START);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [inView, setInView] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [typed, setTyped] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // Typed once, on arrival, and never after a visitor has touched it.
  React.useEffect(() => {
    if (!inView || touched || typed) return;
    const ids = Array.from(TYPED, (_, i) =>
      window.setTimeout(
        () => {
          setQuery(START + TYPED.slice(0, i + 1));
          if (i === TYPED.length - 1) setTyped(true);
        },
        700 + i * 190,
      ),
    );
    return () => {
      for (const id of ids) window.clearTimeout(id);
    };
  }, [inView, touched, typed]);

  const answer = answerQuery(query, { providers: PROVIDERS });

  const palette = (
    <InlineAnswers
      query={query}
      onQueryChange={(q) => {
        setQuery(q);
        setCopied(null);
        setFailed(null);
      }}
      providers={PROVIDERS}
      onCopyAnswer={(a) => setCopied(a.value)}
      onProviderError={(id) => setFailed(id)}
      {...values}
    />
  );

  return (
    <div
      ref={wrapRef}
      onPointerDownCapture={() => setTouched(true)}
      onKeyDownCapture={() => setTouched(true)}
      className="flex w-full max-w-[36rem] flex-col gap-4"
    >
      {palette}
      {chrome ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                aria-pressed={query === example}
                onClick={() => {
                  setQuery(example);
                  setCopied(null);
                  setFailed(null);
                }}
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-2.5 text-xs transition-colors outline-none",
                  query === example
                    ? "border-transparent bg-surface-2 text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              >
                {example}
              </button>
            ))}
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">
              {copied
                ? `copied ${copied}`
                : answer
                  ? `answer ${answer.value}`
                  : failed
                    ? "route planner offline"
                    : "no answer"}
            </span>
            {answer
              ? ` · ${answer.kind}${answer.unsure ? " · not sure" : ""}`
              : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
