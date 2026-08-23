"use client";

import { StepformOneQuestion } from "@/registry/blocks/stepform-one-question/stepform-one-question";

/** The section at its own scale — full width, default narrative. */
export function StepformOneQuestionDemo() {
  return (
    <div className="w-full">
      <StepformOneQuestion />
    </div>
  );
}
