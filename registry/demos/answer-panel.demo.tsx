"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AnswerPanel,
  defaultAnswer,
  type AnswerFeedback,
  type AnswerStatus,
} from "@/registry/ui/answer-panel";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 32,
    min: 8,
    max: 64,
    step: 4,
    unit: "tok/s",
  },
  citations: {
    kind: "choice",
    label: "Citations",
    default: "pill",
    options: ["pill", "number", "none"],
    names: { pill: "Pills", number: "Numbers", none: "None" },
  },
  followups: {
    kind: "choice",
    label: "Follow-ups",
    default: "list",
    options: ["list", "chips", "none"],
    names: { list: "List", chips: "Chips", none: "None" },
  },
});

/** A second draft for Regenerate, citing the same sources in other words. */
const SECOND_DRAFT = `The batch missed the cut-off by twelve minutes. Anything submitted after 16:00 settles in the next window [1], and the 14 March batch went in at 16:12 [2].

To keep payouts on the same day:
- Submit before 15:30 so a review hold still clears in time [1].
- Use early settlement for smaller payouts. It skips the window for a 0.2% fee [3].

The money was never at risk. It spent one business day in transit and arrived in full [2].`;

const DRAFTS = [defaultAnswer, SECOND_DRAFT];

/**
 * Coldbrook Bank's business help assistant, answering why a payout batch
 * settled a day late. Regenerate swaps between two drafts; with chrome on,
 * "Fail next" makes the next draft stop partway so the error state shows.
 */
export function AnswerPanelDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<AnswerStatus>("thinking");
  const [draft, setDraft] = React.useState(0);
  const [feedback, setFeedback] = React.useState<AnswerFeedback>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [failing, setFailing] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);

  // The failing draft is cut off by the host a moment into its stream, as a
  // dropped connection would.
  React.useEffect(() => {
    if (!failing || status !== "streaming") return;
    const id = window.setTimeout(() => {
      setFailing(false);
      setStatus("error");
    }, 1500);
    return () => window.clearTimeout(id);
  }, [failing, status]);

  const line =
    note ??
    (status === "thinking"
      ? "thinking · reading the batch log"
      : status === "streaming"
        ? "writing the answer"
        : status === "error"
          ? "stopped partway · retry"
          : feedback === "up"
            ? "answer ready · marked helpful"
            : feedback === "down"
              ? "answer ready · marked not helpful"
              : "answer ready · 3 sources cited");

  return (
    <div className="flex w-full max-w-5xl flex-col gap-3">
      <AnswerPanel
        className={chrome ? "h-[460px]" : "h-[536px]"}
        answer={DRAFTS[draft] ?? defaultAnswer}
        status={status}
        onStatusChange={(next) => {
          setNote(null);
          setStatus(next);
        }}
        feedback={feedback}
        onFeedbackChange={setFeedback}
        onRegenerate={() => {
          setDraft((d) => (d + 1) % DRAFTS.length);
          if (failNext) {
            setFailNext(false);
            setFailing(true);
          }
          setNote(`regenerating · draft ${((draft + 1) % DRAFTS.length) + 1}`);
        }}
        onFollowup={(text) => setNote(`follow-up · ${text.toLowerCase()}`)}
        onSourceOpen={(source) =>
          setNote(`opened · ${source.title.toLowerCase()}`)
        }
        onCopy={() => setNote("copied the answer")}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{line.split(" · ")[0]}</span>
            {line.includes(" · ")
              ? ` · ${line.split(" · ").slice(1).join(" · ")}`
              : null}
          </p>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger/40 aria-pressed:text-danger"
          >
            Fail next
          </button>
        </div>
      ) : null}
    </div>
  );
}
