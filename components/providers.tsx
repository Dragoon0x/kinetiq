"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

import { ThemeProvider } from "@/components/chrome/theme-provider";
import { ForceReducedMotionContext } from "@/registry/hooks/use-motion-safe";

type MotionTestContextValue = {
  /** True while the site-wide "REDUCED MOTION · TEST" switch is on. */
  testingReducedMotion: boolean;
  setTestingReducedMotion: (value: boolean) => void;
};

const MotionTestContext = createContext<MotionTestContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [testingReducedMotion, setTestingReducedMotion] = useState(false);

  const motionTest = useMemo(
    () => ({ testingReducedMotion, setTestingReducedMotion }),
    [testingReducedMotion],
  );

  return (
    <ThemeProvider>
      <MotionConfig reducedMotion={testingReducedMotion ? "always" : "user"}>
        <LazyMotion features={domAnimation}>
          <MotionTestContext.Provider value={motionTest}>
            <ForceReducedMotionContext.Provider value={testingReducedMotion}>
              {testingReducedMotion ? (
                <div data-reduced-motion-test="">{children}</div>
              ) : (
                children
              )}
            </ForceReducedMotionContext.Provider>
          </MotionTestContext.Provider>
        </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  );
}

export function useMotionTest(): MotionTestContextValue {
  const context = useContext(MotionTestContext);
  if (!context) {
    throw new Error("useMotionTest must be used within Providers");
  }
  return context;
}
