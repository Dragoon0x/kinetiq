"use client";

import { LaunchChecklist } from "@/registry/blocks/launch-checklist/launch-checklist";

const STEPS = [
  {
    id: "workspace",
    title: "Name your workspace",
    description: "Pick something your team will recognize.",
  },
  {
    id: "import",
    title: "Import your first dataset",
    description: "CSV, Parquet, or a live connection.",
  },
  {
    id: "invite",
    title: "Invite two teammates",
    description: "Review works better with more eyes.",
  },
  {
    id: "alerts",
    title: "Set an alert threshold",
    description: "We page you only past this line.",
  },
  {
    id: "deploy",
    title: "Run your first deploy",
    description: "Ship it. The checklist stamps itself.",
  },
];

export function LaunchChecklistDemo() {
  return (
    <LaunchChecklist
      title="Set up your workspace"
      steps={STEPS}
      defaultCompleted={["workspace"]}
    />
  );
}
