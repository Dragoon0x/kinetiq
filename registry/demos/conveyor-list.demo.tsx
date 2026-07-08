"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { ConveyorList } from "@/registry/ui/conveyor-list";
import { PressureButton } from "@/registry/ui/pressure-button";

type JobStatus = "queued" | "rendering" | "done";
type Job = { id: string; name: string; status: JobStatus };

const JOB_NAMES = [
  "frame_0142.exr",
  "comp_hero_v3.mp4",
  "denoise_pass_02.exr",
  "roto_shot_007.nk",
  "grade_master_v2.mov",
  "sim_flip_cache_18.vdb",
  "frame_0143.exr",
  "light_bake_interior.exr",
  "comp_title_v1.mp4",
  "fx_smoke_layer_04.exr",
] as const;

const MAX_VISIBLE = 4;
const MAX_AUTO_JOBS = 30;

const CHIP_CLASSES: Record<JobStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  rendering: "bg-primary/15 text-primary",
  done: "bg-primary text-primary-foreground",
};

const INITIAL_JOBS: Job[] = [
  { id: "job-3", name: "comp_hero_v3.mp4", status: "queued" },
  { id: "job-2", name: "frame_0142.exr", status: "rendering" },
  { id: "job-1", name: "grade_master_v2.mov", status: "rendering" },
];

export function ConveyorListDemo() {
  const [jobs, setJobs] = React.useState<Job[]>(INITIAL_JOBS);
  const jobsRef = React.useRef(jobs);
  React.useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const nextId = React.useRef(4);
  const autoAdded = React.useRef(0);
  const timers = React.useRef(new Set<number>());

  const addJob = React.useCallback(() => {
    const n = nextId.current;
    nextId.current += 1;
    const job: Job = {
      id: `job-${n}`,
      name: JOB_NAMES[n % JOB_NAMES.length] ?? "frame_0000.exr",
      status: n % 3 === 0 ? "rendering" : "queued",
    };
    setJobs((prev) => [job, ...prev]);
  }, []);

  const completeNext = React.useCallback(() => {
    // The oldest visible job flashes success, then lifts off the belt.
    const visible = jobsRef.current.slice(0, MAX_VISIBLE);
    const target = [...visible].reverse().find((job) => job.status !== "done");
    if (!target) return;
    setJobs((prev) =>
      prev.map((job) =>
        job.id === target.id ? { ...job, status: "done" } : job,
      ),
    );
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setJobs((prev) => prev.filter((job) => job.id !== target.id));
    }, 450);
    timers.current.add(timer);
  }, []);

  React.useEffect(() => {
    const arrivals = window.setInterval(() => {
      if (autoAdded.current >= MAX_AUTO_JOBS) return;
      autoAdded.current += 1;
      addJob();
    }, 2200);
    const completions = window.setInterval(completeNext, 3000);
    const pending = timers.current;
    return () => {
      window.clearInterval(arrivals);
      window.clearInterval(completions);
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, [addJob, completeNext]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
          Render queue
        </p>
        <p className="text-muted-foreground font-mono text-xs tabular-nums">
          {jobs.length} jobs
        </p>
      </div>
      <ConveyorList
        items={jobs}
        keyFor={(job) => job.id}
        maxVisible={MAX_VISIBLE}
        label="Render queue"
        announceItem={(job) => `${job.name} ${job.status}`}
        renderItem={(job) => (
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-mono text-xs">{job.name}</span>
            <span
              className={cn(
                "rounded-1 px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase",
                CHIP_CLASSES[job.status],
              )}
            >
              {job.status}
            </span>
          </div>
        )}
      />
      <div className="flex items-center gap-2">
        <PressureButton size="sm" onClick={addJob}>
          Add job
        </PressureButton>
        <PressureButton size="sm" variant="outline" onClick={completeNext}>
          Complete next
        </PressureButton>
      </div>
    </div>
  );
}
