"use client";

import { Recycle, Thermometer, Truck } from "lucide-react";

import {
  DrawerAccordion,
  DrawerAccordionContent,
  DrawerAccordionItem,
  DrawerAccordionTrigger,
} from "@/registry/ui/drawer-accordion";

const TRANSPORT_LIMITS = [
  ["Shock", "≤ 8 g / 11 ms"],
  ["Vibration", "≤ 2.4 g rms"],
  ["Tilt", "≤ 15°"],
] as const;

export function DrawerAccordionDemo() {
  return (
    <div className="w-full max-w-md">
      <DrawerAccordion defaultValue="spec-a-1">
        <DrawerAccordionItem value="spec-a-1">
          <DrawerAccordionTrigger icon={<Thermometer />}>
            <span className="text-muted-foreground font-mono text-xs">
              SPEC A-1
            </span>
            <span className="ml-2">Storage &amp; handling</span>
          </DrawerAccordionTrigger>
          <DrawerAccordionContent className="text-muted-foreground">
            Keep sealed units between 10–24 °C at under 60% relative humidity.
            Handle with lined gloves; bare contact leaves residue on the
            actuator housing.
          </DrawerAccordionContent>
        </DrawerAccordionItem>

        <DrawerAccordionItem value="spec-a-2">
          <DrawerAccordionTrigger icon={<Truck />}>
            <span className="text-muted-foreground font-mono text-xs">
              SPEC A-2
            </span>
            <span className="ml-2">Transport tolerances</span>
          </DrawerAccordionTrigger>
          <DrawerAccordionContent className="text-muted-foreground">
            Crated assemblies tolerate road transport up to 900 km without
            recalibration. Verify the shock indicators on arrival before
            signing the manifest.
            <div className="border-border divide-border mt-3 divide-y rounded-2 border font-mono text-xs">
              {TRANSPORT_LIMITS.map(([label, limit]) => (
                <div
                  key={label}
                  className="grid grid-cols-2 gap-2 px-2.5 py-1.5"
                >
                  <span>{label}</span>
                  <span className="text-foreground text-right tabular-nums">
                    {limit}
                  </span>
                </div>
              ))}
            </div>
          </DrawerAccordionContent>
        </DrawerAccordionItem>

        <DrawerAccordionItem value="spec-a-3">
          <DrawerAccordionTrigger icon={<Recycle />}>
            <span className="text-muted-foreground font-mono text-xs">
              SPEC A-3
            </span>
            <span className="ml-2">Decommissioning</span>
          </DrawerAccordionTrigger>
          <DrawerAccordionContent className="text-muted-foreground">
            Discharge the preload spring fully before removing the retaining
            collar. Return serialized parts to the depot; the housing itself is
            recyclable.
          </DrawerAccordionContent>
        </DrawerAccordionItem>
      </DrawerAccordion>
    </div>
  );
}
