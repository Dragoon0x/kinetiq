"use client";

import { TrainOfThought } from "@/registry/ui/train-of-thought";

export function TrainOfThoughtDemo() {
  return (
    <div className="flex w-full justify-center">
      <TrainOfThought defaultOpen />
    </div>
  );
}
