"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BeforeYouSend,
  defaultHelpArticles,
  scoreArticles,
  type ContactDraft,
} from "@/registry/ui/before-you-send";

export const tweaks = defineTweaks({
  resultStyle: {
    kind: "choice",
    label: "Answers",
    default: "cards",
    options: ["cards", "rows", "wash"],
    names: { cards: "Cards", rows: "Rows", wash: "Wash" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "jade", "amber", "mono"],
    names: { cobalt: "Cobalt", jade: "Jade", amber: "Amber", mono: "Mono" },
  },
});

const QUESTION = "Charged twice after changing my card";
const START: ContactDraft = {
  topic: "billing",
  subject: "",
  details: "",
  email: "jun@coldbrook.studio",
};

/**
 * Fieldline's contact page. Jun starts writing in about a double charge;
 * before the message is finished, the help articles that answer it slide up
 * under the subject. The gallery card types the question itself a moment
 * after it is seen.
 */
export function BeforeYouSendDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [draft, setDraft] = React.useState<ContactDraft>(START);
  const [typing, setTyping] = React.useState<string | null>(null);
  const [broken, setBroken] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.4 });
  const brokenRef = React.useRef(broken);
  React.useEffect(() => {
    brokenRef.current = broken;
  }, [broken]);

  // The gallery card asks its question once it has been seen.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (chrome || !inView || asked.current) return;
    const t = window.setTimeout(() => {
      asked.current = true;
      setTyping(QUESTION);
    }, 1000);
    return () => window.clearTimeout(t);
  }, [chrome, inView]);

  // Types the question a letter at a time, the way a person would, and only
  // while the demo is on screen.
  const draftRef = React.useRef(draft);
  React.useEffect(() => {
    draftRef.current = draft;
  });
  React.useEffect(() => {
    if (typing === null || !inView) return;
    const t = window.setInterval(() => {
      const d = draftRef.current;
      if (!typing.startsWith(d.subject) || d.subject.length >= typing.length) {
        setTyping(null);
        return;
      }
      const next = { ...d, subject: typing.slice(0, d.subject.length + 1) };
      draftRef.current = next;
      setDraft(next);
    }, 70);
    return () => window.clearInterval(t);
  }, [typing, inView]);

  const found = scoreArticles(defaultHelpArticles, draft.subject, draft.topic)
    .filter((m) => m.relevance >= 0.25)
    .slice(0, 3);

  const surface = (
    <BeforeYouSend
      key={round}
      value={draft}
      onValueChange={(next) => {
        setTyping(null);
        setDraft(next);
        setNote(null);
      }}
      onSearch={() =>
        brokenRef.current
          ? new Promise<never>((_, reject) =>
              window.setTimeout(() => reject(new Error("offline")), 400),
            )
          : undefined
      }
      onSolved={(article) =>
        setNote(`solved · no ticket · ${article.title.toLowerCase()}`)
      }
      onSend={() =>
        new Promise<{ reference: string }>((resolve) =>
          window.setTimeout(() => {
            setNote("sent · #FL-4831");
            resolve({ reference: "FL-4831" });
          }, 600),
        )
      }
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-danger/50 aria-pressed:text-danger",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-2xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setDraft((d) => ({ ...d, subject: "" }));
            setNote(null);
            setTyping(QUESTION);
          }}
          className={button}
        >
          Type a question
        </button>
        <button
          type="button"
          aria-pressed={broken}
          onClick={() => setBroken((b) => !b)}
          className={button}
        >
          Break search
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(START);
            setTyping(null);
            setBroken(false);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ??
            (broken && draft.subject.trim().length >= 3
              ? "search offline · send still works"
              : found.length
                ? `${found.length} ${found.length === 1 ? "answer" : "answers"} · top: ${found[0]?.article.title.toLowerCase() ?? ""}`
                : "type a subject")}
        </span>{" "}
        · fieldline support
      </p>
    </div>
  );
}
