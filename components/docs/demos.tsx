import type { ComponentType } from "react";

import { BreakerSwitchDemo } from "@/registry/demos/breaker-switch.demo";
import { CaliperSliderDemo } from "@/registry/demos/caliper-slider.demo";
import { CalloutDemo } from "@/registry/demos/callout.demo";
import { CheckboxDemo } from "@/registry/demos/checkbox.demo";
import { ConveyorListDemo } from "@/registry/demos/conveyor-list.demo";
import { MagnetDockDemo } from "@/registry/demos/magnet-dock.demo";
import { DrawerAccordionDemo } from "@/registry/demos/drawer-accordion.demo";
import { FlapboardDemo } from "@/registry/demos/flapboard.demo";
import { FocusTextDemo } from "@/registry/demos/focus-text.demo";
import { GantryTabsDemo } from "@/registry/demos/gantry-tabs.demo";
import { GyroCardDemo } from "@/registry/demos/gyro-card.demo";
import { ScopeScrubberDemo } from "@/registry/demos/scope-scrubber.demo";
import { SelectDemo } from "@/registry/demos/select.demo";
import { MetronomeLoaderDemo } from "@/registry/demos/metronome-loader.demo";
import { MorphDialogDemo } from "@/registry/demos/morph-dialog.demo";
import { TelemetryToastDemo } from "@/registry/demos/telemetry-toast.demo";
import { LaunchChecklistDemo } from "@/registry/demos/launch-checklist.demo";
import { PressureButtonDemo } from "@/registry/demos/pressure-button.demo";
import { ReadoutDemo } from "@/registry/demos/readout.demo";
import { ScanRevealDemo } from "@/registry/demos/scan-reveal.demo";
import { TickerTapeDemo } from "@/registry/demos/ticker-tape.demo";
import { TraceInputDemo } from "@/registry/demos/trace-input.demo";

/**
 * slug → live preview component. Every catalog item registers its demo here;
 * the docs template renders it inside a SpecimenPlate.
 */
export const demos: Record<string, ComponentType> = {
  "pressure-button": PressureButtonDemo,
  "trace-input": TraceInputDemo,
  "breaker-switch": BreakerSwitchDemo,
  checkbox: CheckboxDemo,
  "caliper-slider": CaliperSliderDemo,
  "gantry-tabs": GantryTabsDemo,
  select: SelectDemo,
  "scope-scrubber": ScopeScrubberDemo,
  "gyro-card": GyroCardDemo,
  "magnet-dock": MagnetDockDemo,
  "conveyor-list": ConveyorListDemo,
  "drawer-accordion": DrawerAccordionDemo,
  callout: CalloutDemo,
  readout: ReadoutDemo,
  "focus-text": FocusTextDemo,
  flapboard: FlapboardDemo,
  "metronome-loader": MetronomeLoaderDemo,
  "morph-dialog": MorphDialogDemo,
  "telemetry-toast": TelemetryToastDemo,
  "ticker-tape": TickerTapeDemo,
  "scan-reveal": ScanRevealDemo,
  "launch-checklist": LaunchChecklistDemo,
};
