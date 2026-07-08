import type { ComponentType } from "react";

import { CascadeLab } from "@/components/playground/labs/cascade-lab";
import { EasingLab } from "@/components/playground/labs/easing-lab";
import { GesturesLab } from "@/components/playground/labs/gestures-lab";
import { KeyframesLab } from "@/components/playground/labs/keyframes-lab";
import { LayoutLab } from "@/components/playground/labs/layout-lab";
import { ScrollLab } from "@/components/playground/labs/scroll-lab";
import { SpringLab } from "@/components/playground/labs/spring-lab";

/** slug → lab experiment component. Each lab registers here. */
export const labComponents: Record<string, ComponentType> = {
  spring: SpringLab,
  easing: EasingLab,
  cascade: CascadeLab,
  keyframes: KeyframesLab,
  gestures: GesturesLab,
  layout: LayoutLab,
  scroll: ScrollLab,
};
