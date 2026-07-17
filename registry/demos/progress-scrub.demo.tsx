"use client";

import { ProgressScrub } from "@/registry/ui/progress-scrub";

const PARAS = [
  "Precision is a feeling. You know a good spring the moment your cursor touches it — it answers before the eye has time to doubt.",
  "The rig settled at 4.6 mm after two passes, and the tolerance held inside a tenth across the whole run.",
  "Capture ran at 48 kHz with no dropped frames. The cobalt housing took the brass collar without a shim.",
  "Recalibrate on the 14th; the rig drifts about a tenth a month, and the seal ring sets best when it is fresh.",
  "The press holds nine tonnes at the peak. It lost pressure once mid-cycle, so the cell locks until it is inspected.",
];

export function ProgressScrubDemo() {
  return (
    <div className="w-full max-w-sm">
      <ProgressScrub height={200} label="Field note progress">
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          {PARAS.map((para, index) => (
            <p key={index}>{para}</p>
          ))}
        </div>
      </ProgressScrub>
    </div>
  );
}
