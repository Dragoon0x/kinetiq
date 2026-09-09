"use client";

import * as React from "react";

import { ReviewStamp, type ReviewRecord } from "@/registry/ui/review-stamp";

/** Coldbrook support checks an answer about a disputed charge before it goes out. */
const MODEL = "Fernworks Model 3";
const ANSWER =
  "The 18.40 charge on the 3rd is a hold from Basinworks Exchange, not a payment. It drops off on its own within five working days, and nothing leaves your balance unless the merchant completes it.";
/** Seeded: who approves, and when the desk clock said so. */
const REVIEW: ReviewRecord = {
  reviewer: "Ines Marlow",
  team: "Coldbrook support",
  at: "14:32",
};

export function ReviewStampDemo() {
  const [review, setReview] = React.useState<ReviewRecord | null>(null);
  const [revoked, setRevoked] = React.useState(false);

  const status = review
    ? `Reviewed · ${review.reviewer} · ${review.at}`
    : revoked
      ? "Review revoked"
      : "Unreviewed";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReviewStamp
        label="Answer awaiting review"
        model={MODEL}
        answer={ANSWER}
        review={review}
        onApprove={() => {
          setRevoked(false);
          setReview(REVIEW);
        }}
        onRevoke={() => {
          setRevoked(true);
          setReview(null);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
