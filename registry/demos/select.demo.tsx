"use client";

import * as React from "react";

import { Select, type SelectItem } from "@/registry/ui/select";

const CHANNELS: SelectItem[] = [
  {
    label: "Optical",
    options: [
      {
        value: "CH-01",
        label: "CH-01 Interferometer",
        description: "Laser fringe counter",
      },
      {
        value: "CH-02",
        label: "CH-02 Spectral",
        description: "Wideband emission scan",
      },
    ],
  },
  {
    label: "Mechanical",
    options: [
      {
        value: "CH-11",
        label: "CH-11 Strain",
        description: "Bridge gauge array",
      },
      {
        value: "CH-12",
        label: "CH-12 Vibration",
        description: "Triaxial accelerometer",
      },
      {
        value: "CH-13",
        label: "CH-13 Acoustic",
        description: "Offline",
        disabled: true,
      },
    ],
  },
];

const CHANNEL_NAMES: Record<string, string> = {
  "CH-01": "CH-01 INTERFEROMETER",
  "CH-02": "CH-02 SPECTRAL",
  "CH-11": "CH-11 STRAIN",
  "CH-12": "CH-12 VIBRATION",
};

export function SelectDemo() {
  const [channel, setChannel] = React.useState("CH-11");

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <Select
        label="Telemetry channel"
        items={CHANNELS}
        defaultValue="CH-11"
        onValueChange={setChannel}
        searchable
        name="telemetry-channel"
      />
      <p
        role="status"
        className="text-muted-foreground font-mono text-xs tabular-nums"
      >
        MONITORING · {CHANNEL_NAMES[channel] ?? channel}
      </p>
    </div>
  );
}
