import type { ComponentType } from "react";

import { LaunchChecklistDemo } from "@/registry/demos/launch-checklist.demo";
import { PressureButtonDemo } from "@/registry/demos/pressure-button.demo";

/**
 * slug → live preview component. Every catalog item registers its demo here;
 * the docs template renders it inside a SpecimenPlate.
 */
export const demos: Record<string, ComponentType> = {
  "pressure-button": PressureButtonDemo,
  "launch-checklist": LaunchChecklistDemo,
};
