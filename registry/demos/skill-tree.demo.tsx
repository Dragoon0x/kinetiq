"use client";

import { SkillTree } from "@/registry/ui/skill-tree";

export function SkillTreeDemo() {
  return (
    <div className="flex w-full justify-center">
      <SkillTree points={7} />
    </div>
  );
}
