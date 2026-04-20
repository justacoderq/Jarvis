import { NotificationWatcher } from "./notification-watcher.js";
import { notificationFilter } from "./notification-filter.js";
import { deviceLock } from "./device-lock.js";
import { isScreenOn, wakeAndUnlock, sleepDevice } from "./device-wake.js";
import { runTriageAgent, type TriageResult } from "../agent.js";
import type { NotificationInfo } from "../types/notification.js";

export interface TriageLogEntry {
  timestamp: number;
  packageName: string;
  title: string;
  action: string;
  reason: string;
}

const MAX_LOG_ENTRIES = 100;
const MAX_NOTIFICATION_AGE_MS = 60_000; // 60 seconds

class NotificationQueue {
  private watcher: NotificationWatcher;
  private queue: NotificationInfo[] = [];
  private triageLog: TriageLogEntry[] = [];
  private processing = false;
  private running = false;

  constructor() {
    this.watcher = new NotificationWatcher();
    this.watcher.on("new", (n: NotificationInfo) => this.onNotification(n));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.watcher.start(5000);
    console.log("\x1b[32m[notification-queue] Watcher started\x1b[0m");
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.watcher.stop();
    this.watcher.reset();
    this.queue.length = 0;
    console.log("\x1b[33m[notification-queue] Watcher stopped\x1b[0m");
  }

  isRunning(): boolean {
    return this.running;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getTriageLog(): TriageLogEntry[] {
    return [...this.triageLog];
  }

  private onNotification(n: NotificationInfo): void {
    if (!notificationFilter.isAllowed(n.packageName)) return;

    this.queue.push(n);
    console.log(`\x1b[36m[notification-queue] Queued: ${n.packageName} — ${n.title}\x1b[0m`);

    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const notification = this.queue.shift()!;

      // Skip notifications older than 60s
      if (notification.time > 0 && Date.now() - notification.time > MAX_NOTIFICATION_AGE_MS) {
        this.addLogEntry(notification, "skip", "Notification too old (>60s)");
        continue;
      }

      // Skip if device locked by user (don't interrupt)
      const lockState = deviceLock.getState();
      if (lockState.locked && lockState.ownerType === "user") {
        this.addLogEntry(notification, "skip", "Device locked by user");
        continue;
      }

      // Wake device if screen is off
      let wokeDevice = false;
      const screenOn = await isScreenOn();
      if (!screenOn) {
        const unlocked = await wakeAndUnlock();
        if (!unlocked) {
          this.addLogEntry(notification, "skip", "Failed to wake/unlock device");
          continue;
        }
        wokeDevice = true;
      }

      // Acquire device lock
      const agentOwner = `notification-agent-${Date.now()}`;
      const acquired = deviceLock.acquire(agentOwner, "notification-agent");
      if (!acquired) {
        this.addLogEntry(notification, "skip", "Could not acquire device lock");
        if (wokeDevice) { try { await sleepDevice(); } catch {} }
        continue;
      }

      try {
        console.log(`\x1b[35m[notification-queue] Triaging: ${notification.packageName} — ${notification.title}\x1b[0m`);
        const result: TriageResult = await runTriageAgent({
          packageName: notification.packageName,
          title: notification.title,
          text: notification.text,
          actions: notification.actions,
        });
        this.addLogEntry(notification, result.action, result.reason);
        console.log(`\x1b[35m[notification-queue] Decision: ${result.action}\x1b[0m`);
      } catch (err: any) {
        this.addLogEntry(notification, "error", err.message);
        console.error(`\x1b[31m[notification-queue] Triage error: ${err.message}\x1b[0m`);
      } finally {
        deviceLock.release(agentOwner);
        if (wokeDevice) { try { await sleepDevice(); } catch {} }
      }
    }

    this.processing = false;
  }

  private addLogEntry(n: NotificationInfo, action: string, reason: string): void {
    this.triageLog.push({
      timestamp: Date.now(),
      packageName: n.packageName,
      title: n.title,
      action,
      reason,
    });
    if (this.triageLog.length > MAX_LOG_ENTRIES) {
      this.triageLog.shift();
    }
  }
}

export const notificationQueue = new NotificationQueue();
