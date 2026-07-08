import type { ComponentType } from "react";

import { SpringLab } from "@/components/playground/labs/spring-lab";

/** slug → lab experiment component. Each lab registers here. */
export const labComponents: Record<string, ComponentType> = {
  spring: SpringLab,
};
