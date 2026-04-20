import { NotificationWatcher } from "./notification-watcher.js";
import { notificationFilter } from "./notification-filter.js";
import { deviceLock } from "./device-lock.js";
import { isScreenOn, wakeAndUnlock, sleepDevice } from "./device-wake.js";
import {
  runAgent,
  runNotificationPolicyAgent,
  type NotificationPolicyResult,
} from "../agent.js";
import type { NotificationInfo } from "../types/notification.js";
import { executeShell } from "./shell-executor.js";

export interface TriageLogEntry {
  timestamp: number;
  packageName: string;
  title: string;
  action: string;
  urgency: string;
  reason: string;
  safeToAct?: boolean;
  targetPackage?: string;
  executionStatus?: "not_run" | "success" | "failed";
  verification?: string;
}

const MAX_LOG_ENTRIES = 100;
const MAX_NOTIFICATION_AGE_MS = 60_000;

class NotificationQueue {
  private watcher: NotificationWatcher;
  private queue: NotificationInfo[] = [];
  private triageLog: TriageLogEntry[] = [];
  private processing = false;
  private running = false;

  constructor() {
    this.watcher = new NotificationWatcher();
    this.watcher.on("new", (notification: NotificationInfo) => this.onNotification(notification));
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

  enqueue(notification: NotificationInfo): void {
    this.onNotification(notification);
  }

  private onNotification(notification: NotificationInfo): void {
    if (!notificationFilter.isAllowed(notification.packageName)) return;

    this.queue.push(notification);
    console.log(`\x1b[36m[notification-queue] Queued: ${notification.packageName} - ${notification.title}\x1b[0m`);

    if (!this.processing) {
      void this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const notification = this.queue.shift()!;

      if (notification.time > 0 && Date.now() - notification.time > MAX_NOTIFICATION_AGE_MS) {
        this.addLogEntry(notification, {
          action: "skip",
          urgency: "low",
          reason: "Notification too old (>60s).",
          executionStatus: "not_run",
          verification: "Dropped before policy evaluation.",
        });
        continue;
      }

      const lockState = deviceLock.getState();
      if (lockState.locked && lockState.ownerType === "user") {
        this.addLogEntry(notification, {
          action: "skip",
          urgency: "low",
          reason: "Device locked by user.",
          executionStatus: "not_run",
          verification: "Skipped to avoid interrupting the user.",
        });
        continue;
      }

      let wokeDevice = false;
      const screenOn = await isScreenOn();
      if (!screenOn) {
        const unlocked = await wakeAndUnlock();
        if (!unlocked) {
          this.addLogEntry(notification, {
            action: "skip",
            urgency: "low",
            reason: "Failed to wake or unlock device.",
            executionStatus: "not_run",
            verification: "Could not prepare device for notification handling.",
          });
          continue;
        }
        wokeDevice = true;
      }

      const agentOwner = `notification-agent-${Date.now()}`;
      const acquired = deviceLock.acquire(agentOwner, "notification-agent");
      if (!acquired) {
        this.addLogEntry(notification, {
          action: "skip",
          urgency: "low",
          reason: "Could not acquire device lock.",
          executionStatus: "not_run",
          verification: "Another workflow already owns the device lock.",
        });
        if (wokeDevice) {
          try { await sleepDevice(); } catch {}
        }
        continue;
      }

      try {
        console.log(`\x1b[35m[notification-queue] Policy evaluating: ${notification.packageName} - ${notification.title}\x1b[0m`);
        const policy = await runNotificationPolicyAgent({
          packageName: notification.packageName,
          title: notification.title,
          text: notification.text,
          actions: notification.actions,
        });

        await this.handlePolicyDecision(notification, policy, agentOwner);
      } catch (err: any) {
        this.addLogEntry(notification, {
          action: "error",
          urgency: "unknown",
          reason: err.message,
          executionStatus: "failed",
          verification: "Policy pipeline crashed before completion.",
        });
        console.error(`\x1b[31m[notification-queue] Policy error: ${err.message}\x1b[0m`);
      } finally {
        deviceLock.release(agentOwner);
        if (wokeDevice) {
          try { await sleepDevice(); } catch {}
        }
      }
    }

    this.processing = false;
  }

  private async handlePolicyDecision(
    notification: NotificationInfo,
    policy: NotificationPolicyResult,
    agentOwner: string
  ): Promise<void> {
    console.log(`\x1b[35m[notification-queue] Decision: ${policy.decision} (${policy.urgency})\x1b[0m`);

    if (policy.decision === "ignore") {
      this.addLogEntry(notification, {
        action: "ignore",
        urgency: policy.urgency,
        reason: policy.reason,
        safeToAct: false,
        targetPackage: policy.targetPackage,
        executionStatus: "not_run",
        verification: policy.summary,
      });
      return;
    }

    if (policy.decision === "log") {
      await this.appendNotificationNote(notification, policy);
      this.addLogEntry(notification, {
        action: "log",
        urgency: policy.urgency,
        reason: policy.reason,
        safeToAct: false,
        targetPackage: policy.targetPackage,
        executionStatus: "not_run",
        verification: "Logged for later review.",
      });
      return;
    }

    if (policy.decision === "alert") {
      await this.appendNotificationNote(notification, policy);
      this.addLogEntry(notification, {
        action: "alert",
        urgency: policy.urgency,
        reason: policy.reason,
        safeToAct: false,
        targetPackage: policy.targetPackage,
        executionStatus: "not_run",
        verification: policy.summary,
      });
      return;
    }

    if (policy.decision === "act" && policy.safeToAct && policy.executionPrompt.trim()) {
      const result = await runAgent(policy.executionPrompt, { agentId: agentOwner });
      const success = !this.looksLikeFailure(result.text);
      const verification = this.summarizeVerification(result.text, notification, policy);
      this.addLogEntry(notification, {
        action: "act",
        urgency: policy.urgency,
        reason: policy.reason,
        safeToAct: true,
        targetPackage: policy.targetPackage,
        executionStatus: success ? "success" : "failed",
        verification,
      });
      return;
    }

    this.addLogEntry(notification, {
      action: "alert",
      urgency: policy.urgency,
      reason: policy.reason,
      safeToAct: false,
      targetPackage: policy.targetPackage,
      executionStatus: "not_run",
      verification: "Policy downgraded because autonomous action was unsafe or ambiguous.",
    });
  }

  private async appendNotificationNote(
    notification: NotificationInfo,
    policy: NotificationPolicyResult
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const note = [
      `[${timestamp}] ${notification.packageName}`,
      `Title: ${notification.title}`,
      `Text: ${notification.text}`,
      `Urgency: ${policy.urgency}`,
      `Decision: ${policy.decision}`,
      `Reason: ${policy.reason}`,
      "",
    ].join("\\n").replace(/"/g, '\\"');

    await executeShell(
      `mkdir -p ~/.jarvis-agent && printf "${note}\\n" >> ~/.jarvis-agent/notification-notes.txt`,
      { timeout: 10_000 }
    );
  }

  private summarizeVerification(
    resultText: string,
    notification: NotificationInfo,
    policy: NotificationPolicyResult
  ): string {
    if (!resultText.trim()) {
      return `No final verification text was returned after acting on ${notification.packageName}.`;
    }

    return [
      `Target app: ${policy.targetPackage || notification.packageName}.`,
      `Outcome: ${resultText.trim()}`,
      policy.verificationHint ? `Expected verification: ${policy.verificationHint}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  private looksLikeFailure(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes("error:") ||
      lower.includes("failed") ||
      lower.includes("could not") ||
      lower.includes("unable to") ||
      lower.includes("not found")
    );
  }

  private addLogEntry(
    notification: NotificationInfo,
    entry: Omit<TriageLogEntry, "timestamp" | "packageName" | "title">
  ): void {
    this.triageLog.push({
      timestamp: Date.now(),
      packageName: notification.packageName,
      title: notification.title,
      action: entry.action,
      urgency: entry.urgency,
      reason: entry.reason,
      safeToAct: entry.safeToAct,
      targetPackage: entry.targetPackage,
      executionStatus: entry.executionStatus,
      verification: entry.verification,
    });

    if (this.triageLog.length > MAX_LOG_ENTRIES) {
      this.triageLog.shift();
    }
  }
}

export const notificationQueue = new NotificationQueue();
