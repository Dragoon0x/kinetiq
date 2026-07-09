import type { ComponentType } from "react";

import { AccessPanelDemo } from "@/registry/demos/access-panel.demo";
import { ActionRelayDemo } from "@/registry/demos/action-relay.demo";
import { BalanceCardDemo } from "@/registry/demos/balance-card.demo";
import { BeaconDemo } from "@/registry/demos/beacon.demo";
import { FieldReportDemo } from "@/registry/demos/field-report.demo";
import { BottomSheetDemo } from "@/registry/demos/bottom-sheet.demo";
import { ExchangePanelDemo } from "@/registry/demos/exchange-panel.demo";
import { BreakerSwitchDemo } from "@/registry/demos/breaker-switch.demo";
import { DrawerDemo } from "@/registry/demos/drawer.demo";
import { IrisMenuDemo } from "@/registry/demos/iris-menu.demo";
import { OverflowRailDemo } from "@/registry/demos/overflow-rail.demo";
import { PhaseSwitchDemo } from "@/registry/demos/phase-switch.demo";
import { CommandDeckDemo } from "@/registry/demos/command-deck.demo";
import { CaliperSliderDemo } from "@/registry/demos/caliper-slider.demo";
import { CalloutDemo } from "@/registry/demos/callout.demo";
import { CheckboxDemo } from "@/registry/demos/checkbox.demo";
import { CipherTextDemo } from "@/registry/demos/cipher-text.demo";
import { CodeCellsDemo } from "@/registry/demos/code-cells.demo";
import { CheckoutReceiptDemo } from "@/registry/demos/checkout-receipt.demo";
import { IntakeTrayDemo } from "@/registry/demos/intake-tray.demo";
import { ReadoutGridDemo } from "@/registry/demos/readout-grid.demo";
import { ConveyorListDemo } from "@/registry/demos/conveyor-list.demo";
import { MagnetDockDemo } from "@/registry/demos/magnet-dock.demo";
import { MediaConsoleDemo } from "@/registry/demos/media-console.demo";
import { SignalCenterDemo } from "@/registry/demos/signal-center.demo";
import { DrawerAccordionDemo } from "@/registry/demos/drawer-accordion.demo";
import { FlapboardDemo } from "@/registry/demos/flapboard.demo";
import { FluxCanvasDemo } from "@/registry/demos/flux-canvas.demo";
import { FocusTextDemo } from "@/registry/demos/focus-text.demo";
import { ForecastCardDemo } from "@/registry/demos/forecast-card.demo";
import { GantryTabsDemo } from "@/registry/demos/gantry-tabs.demo";
import { GyroCardDemo } from "@/registry/demos/gyro-card.demo";
import { ScopeScrubberDemo } from "@/registry/demos/scope-scrubber.demo";
import { SelectDemo } from "@/registry/demos/select.demo";
import { SlipstreamDemo } from "@/registry/demos/slipstream.demo";
import { StatusSealDemo } from "@/registry/demos/status-seal.demo";
import { MetronomeLoaderDemo } from "@/registry/demos/metronome-loader.demo";
import { MorphDialogDemo } from "@/registry/demos/morph-dialog.demo";
import { NotFoundDemo } from "@/registry/demos/not-found.demo";
import { TelemetryToastDemo } from "@/registry/demos/telemetry-toast.demo";
import { LaunchChecklistDemo } from "@/registry/demos/launch-checklist.demo";
import { LedgerDemo } from "@/registry/demos/ledger.demo";
import { PressureButtonDemo } from "@/registry/demos/pressure-button.demo";
import { RadioGroupDemo } from "@/registry/demos/radio-group.demo";
import { ReadoutDemo } from "@/registry/demos/readout.demo";
import { ScanRevealDemo } from "@/registry/demos/scan-reveal.demo";
import { TickerTapeDemo } from "@/registry/demos/ticker-tape.demo";
import { TraceInputDemo } from "@/registry/demos/trace-input.demo";
import { WavefieldDemo } from "@/registry/demos/wavefield.demo";
import { ZoetropeDemo } from "@/registry/demos/zoetrope.demo";
import { KineticGalleryDemo } from "@/registry/demos/kinetic-gallery.demo";
import { TileGridDemo } from "@/registry/demos/tile-grid.demo";
import { SegmentedControlDemo } from "@/registry/demos/segmented-control.demo";
import { TriageDeckDemo } from "@/registry/demos/triage-deck.demo";
import { SparkChartDemo } from "@/registry/demos/spark-chart.demo";
import { ActivityRingsDemo } from "@/registry/demos/activity-rings.demo";
import { CoverflowDemo } from "@/registry/demos/coverflow.demo";
import { ParallaxSceneDemo } from "@/registry/demos/parallax-scene.demo";
import { TetherRopeDemo } from "@/registry/demos/tether-rope.demo";
import { PendulumWaveDemo } from "@/registry/demos/pendulum-wave.demo";
import { RubberSheetDemo } from "@/registry/demos/rubber-sheet.demo";
import { IronFilingsDemo } from "@/registry/demos/iron-filings.demo";
import { SwarmFieldDemo } from "@/registry/demos/swarm-field.demo";
import { MagneticCursorDemo } from "@/registry/demos/magnetic-cursor.demo";
import { AuroraRibbonDemo } from "@/registry/demos/aurora-ribbon.demo";
import { PointGlobeDemo } from "@/registry/demos/point-globe.demo";
import { VoronoiShatterDemo } from "@/registry/demos/voronoi-shatter.demo";
import { CometCursorDemo } from "@/registry/demos/comet-cursor.demo";
import { RippleSurfaceDemo } from "@/registry/demos/ripple-surface.demo";

/**
 * slug → live preview component. Every catalog item registers its demo here;
 * the docs template renders it inside a SpecimenPlate.
 */
export const demos: Record<string, ComponentType> = {
  "pressure-button": PressureButtonDemo,
  "action-relay": ActionRelayDemo,
  "status-seal": StatusSealDemo,
  "trace-input": TraceInputDemo,
  "breaker-switch": BreakerSwitchDemo,
  checkbox: CheckboxDemo,
  "radio-group": RadioGroupDemo,
  "code-cells": CodeCellsDemo,
  "caliper-slider": CaliperSliderDemo,
  "gantry-tabs": GantryTabsDemo,
  select: SelectDemo,
  "scope-scrubber": ScopeScrubberDemo,
  "gyro-card": GyroCardDemo,
  "magnet-dock": MagnetDockDemo,
  "conveyor-list": ConveyorListDemo,
  "drawer-accordion": DrawerAccordionDemo,
  drawer: DrawerDemo,
  "bottom-sheet": BottomSheetDemo,
  "phase-switch": PhaseSwitchDemo,
  ledger: LedgerDemo,
  zoetrope: ZoetropeDemo,
  wavefield: WavefieldDemo,
  "flux-canvas": FluxCanvasDemo,
  callout: CalloutDemo,
  readout: ReadoutDemo,
  "focus-text": FocusTextDemo,
  slipstream: SlipstreamDemo,
  "cipher-text": CipherTextDemo,
  flapboard: FlapboardDemo,
  "metronome-loader": MetronomeLoaderDemo,
  "morph-dialog": MorphDialogDemo,
  "telemetry-toast": TelemetryToastDemo,
  "ticker-tape": TickerTapeDemo,
  "scan-reveal": ScanRevealDemo,
  "command-deck": CommandDeckDemo,
  "access-panel": AccessPanelDemo,
  "iris-menu": IrisMenuDemo,
  "overflow-rail": OverflowRailDemo,
  "signal-center": SignalCenterDemo,
  "media-console": MediaConsoleDemo,
  beacon: BeaconDemo,
  "field-report": FieldReportDemo,
  "not-found": NotFoundDemo,
  "forecast-card": ForecastCardDemo,
  "balance-card": BalanceCardDemo,
  "exchange-panel": ExchangePanelDemo,
  "checkout-receipt": CheckoutReceiptDemo,
  "intake-tray": IntakeTrayDemo,
  "readout-grid": ReadoutGridDemo,
  "launch-checklist": LaunchChecklistDemo,
  "kinetic-gallery": KineticGalleryDemo,
  "tile-grid": TileGridDemo,
  "segmented-control": SegmentedControlDemo,
  "triage-deck": TriageDeckDemo,
  "spark-chart": SparkChartDemo,
  "activity-rings": ActivityRingsDemo,
  coverflow: CoverflowDemo,
  "parallax-scene": ParallaxSceneDemo,
  "tether-rope": TetherRopeDemo,
  "pendulum-wave": PendulumWaveDemo,
  "rubber-sheet": RubberSheetDemo,
  "iron-filings": IronFilingsDemo,
  "swarm-field": SwarmFieldDemo,
  "magnetic-cursor": MagneticCursorDemo,
  "aurora-ribbon": AuroraRibbonDemo,
  "point-globe": PointGlobeDemo,
  "voronoi-shatter": VoronoiShatterDemo,
  "comet-cursor": CometCursorDemo,
  "ripple-surface": RippleSurfaceDemo,
};
