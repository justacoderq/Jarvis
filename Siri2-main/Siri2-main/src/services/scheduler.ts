import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { deviceLock } from "./device-lock.js";
import { isScreenOn, wakeAndUnlock, sleepDevice } from "./device-wake.js";
import { runAgent } from "../agent.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  cronExpression: string;
  enabled: boolean;
  createdAt: number;
  lastRunAt: number | null;
  lastResult: string | null;
}

export interface ScheduleLogEntry {
  timestamp: number;
  taskId: string;
  taskName: string;
  success: boolean;
  result: string;
  turns: number;
}

// ---------------------------------------------------------------------------
// Cron matching — 5-field: min hour dom month dow
// Supports: *, specific numbers, comma lists, */N step values
// ---------------------------------------------------------------------------

function matchCronField(field: string, value: number): boolean {
  if (field === "*") return true;

  // Step: */N
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // Comma list: 1,5,10
  const parts = field.split(",");
  for (const part of parts) {
    const n = parseInt(part.trim(), 10);
    if (!isNaN(n) && n === value) return true;
  }

  return false;
}

function matchesCron(expression: string, now: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [minF, hourF, domF, monF, dowF] = fields;
  const minute = now.getMinutes();
  const hour = now.getHours();
  const dom = now.getDate();
  const month = now.getMonth() + 1; // 1-12
  const dow = now.getDay(); // 0=Sunday

  return (
    matchCronField(minF, minute) &&
    matchCronField(hourF, hour) &&
    matchCronField(domF, dom) &&
    matchCronField(monF, month) &&
    matchCronField(dowF, dow)
  );
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

const SIRI2_DIR = join(homedir(), ".siri2");
const TASKS_FILE = join(SIRI2_DIR, "scheduled-tasks.json");
const STATE_FILE = join(SIRI2_DIR, "scheduler-state.json");
const MAX_LOG_ENTRIES = 100;

class Scheduler {
  private tasks: ScheduledTask[] = [];
  private log: ScheduleLogEntry[] = [];
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private executing = false;

  constructor() {
    this.loadTasks();
    // Auto-start if it was running before the server restarted
    if (this.loadRunningState()) {
      this.start();
    }
  }

  // --- Lifecycle ---

  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => this.tick(), 60_000);
    this.saveRunningState(true);
    console.log("\x1b[32m[scheduler] Started (60s interval)\x1b[0m");
  }

  stop(): void {
    if (!this.intervalHandle) return;
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    this.saveRunningState(false);
    console.log("\x1b[33m[scheduler] Stopped\x1b[0m");
  }

  isRunning(): boolean {
    return this.intervalHandle !== null;
  }

  // --- Task management ---

  addTask(opts: { name: string; prompt: string; cronExpression: string }): ScheduledTask {
    const task: ScheduledTask = {
      id: `sched-${Date.now()}`,
      name: opts.name,
      prompt: opts.prompt,
      cronExpression: opts.cronExpression,
      enabled: true,
      createdAt: Date.now(),
      lastRunAt: null,
      lastResult: null,
    };
    this.tasks.push(task);
    this.persist();
    console.log(`\x1b[32m[scheduler] Added task: ${task.name} (${task.cronExpression})\x1b[0m`);
    return task;
  }

  removeTask(id: string): boolean {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const removed = this.tasks.splice(idx, 1)[0];
    this.persist();
    console.log(`\x1b[33m[scheduler] Removed task: ${removed.name}\x1b[0m`);
    return true;
  }

  enableTask(id: string): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return false;
    task.enabled = true;
    this.persist();
    return true;
  }

  disableTask(id: string): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return false;
    task.enabled = false;
    this.persist();
    return true;
  }

  getTasks(): ScheduledTask[] {
    return [...this.tasks];
  }

  getTask(id: string): ScheduledTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  getLog(): ScheduleLogEntry[] {
    return [...this.log];
  }

  // --- Execution ---

  async runNow(id: string): Promise<ScheduleLogEntry | null> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    return this.executeTask(task);
  }

  // --- Internal ---

  private async tick(): Promise<void> {
    if (this.executing) return;

    const now = new Date();
    const due = this.tasks.filter((t) => t.enabled && matchesCron(t.cronExpression, now));

    if (due.length === 0) return;

    this.executing = true;
    for (const task of due) {
      await this.executeTask(task);
    }
    this.executing = false;
  }

  private async executeTask(task: ScheduledTask): Promise<ScheduleLogEntry> {
    console.log(`\x1b[35m[scheduler] Executing: ${task.name}\x1b[0m`);

    const lockOwner = `scheduled-task-${task.id}-${Date.now()}`;
    let entry: ScheduleLogEntry;
    let wokeDevice = false;

    try {
      // Check if device locked by user — skip if so
      const lockState = deviceLock.getState();
      if (lockState.locked && lockState.ownerType === "user") {
        entry = {
          timestamp: Date.now(),
          taskId: task.id,
          taskName: task.name,
          success: false,
          result: "Skipped: device busy (locked by user)",
          turns: 0,
        };
        this.addLogEntry(entry);
        return entry;
      }

      // Wake device if screen is off
      const screenOn = await isScreenOn();
      if (!screenOn) {
        const unlocked = await wakeAndUnlock();
        if (!unlocked) {
          entry = {
            timestamp: Date.now(),
            taskId: task.id,
            taskName: task.name,
            success: false,
            result: "Failed to wake/unlock device",
            turns: 0,
          };
          this.addLogEntry(entry);
          return entry;
        }
        wokeDevice = true;
      }

      // Acquire lock
      const acquired = deviceLock.acquire(lockOwner, "scheduled-task");
      if (!acquired) {
        entry = {
          timestamp: Date.now(),
          taskId: task.id,
          taskName: task.name,
          success: false,
          result: "Skipped: could not acquire device lock",
          turns: 0,
        };
        this.addLogEntry(entry);
        return entry;
      }

      // Run agent
      const result = await runAgent(task.prompt, { agentId: lockOwner });

      entry = {
        timestamp: Date.now(),
        taskId: task.id,
        taskName: task.name,
        success: true,
        result: result.text.slice(0, 500),
        turns: result.turns,
      };

      // Update task
      task.lastRunAt = Date.now();
      task.lastResult = result.text.slice(0, 500);
      this.persist();
    } catch (err: any) {
      entry = {
        timestamp: Date.now(),
        taskId: task.id,
        taskName: task.name,
        success: false,
        result: `Error: ${err.message}`.slice(0, 500),
        turns: 0,
      };
    } finally {
      deviceLock.release(lockOwner);

      // Only sleep the device if we woke it up
      if (wokeDevice) {
        try {
          await sleepDevice();
        } catch {}
      }
    }

    this.addLogEntry(entry!);
    console.log(`\x1b[35m[scheduler] Finished: ${task.name} (${entry!.success ? "ok" : "fail"})\x1b[0m`);
    return entry!;
  }

  private addLogEntry(entry: ScheduleLogEntry): void {
    this.log.push(entry);
    if (this.log.length > MAX_LOG_ENTRIES) {
      this.log.shift();
    }
  }

  private persist(): void {
    if (!existsSync(SIRI2_DIR)) mkdirSync(SIRI2_DIR, { recursive: true });
    writeFileSync(TASKS_FILE, JSON.stringify(this.tasks, null, 2), "utf-8");
  }

  private loadTasks(): void {
    if (!existsSync(TASKS_FILE)) return;
    try {
      this.tasks = JSON.parse(readFileSync(TASKS_FILE, "utf-8"));
      console.log(`\x1b[90m[scheduler] Loaded ${this.tasks.length} tasks from disk\x1b[0m`);
    } catch {
      this.tasks = [];
    }
  }

  private saveRunningState(running: boolean): void {
    if (!existsSync(SIRI2_DIR)) mkdirSync(SIRI2_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ running }), "utf-8");
  }

  private loadRunningState(): boolean {
    if (!existsSync(STATE_FILE)) return false;
    try {
      const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      return data.running === true;
    } catch {
      return false;
    }
  }
}

// Singleton
export const scheduler = new Scheduler();
