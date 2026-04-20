import { EventEmitter } from "node:events";
import { executeShell } from "./shell-executor.js";
import type { NotificationInfo } from "../types/notification.js";

export class NotificationWatcher extends EventEmitter {
  private interval: ReturnType<typeof setInterval> | null = null;
  private previousKeys = new Set<string>();

  start(pollIntervalMs = 5000): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.poll(), pollIntervalMs);
    this.poll();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  reset(): void {
    this.previousKeys.clear();
  }

  private async poll(): Promise<void> {
    try {
      const notifications = await getNotifications();
      const currentKeys = new Set(notifications.map((n) => n.key));

      for (const n of notifications) {
        if (!this.previousKeys.has(n.key)) {
          this.emit("new", n);
        }
      }

      for (const key of this.previousKeys) {
        if (!currentKeys.has(key)) {
          this.emit("removed", key);
        }
      }

      this.previousKeys = currentKeys;
    } catch {
      // Silently ignore poll errors
    }
  }
}

export async function getNotifications(): Promise<NotificationInfo[]> {
  const { stdout } = await executeShell("dumpsys notification --noredact", {
    timeout: 15_000,
  });

  return parseNotificationDump(stdout);
}

function parseNotificationDump(dump: string): NotificationInfo[] {
  const notifications: NotificationInfo[] = [];
  const sections = dump.split(/\s{4}NotificationRecord\(/);

  for (const section of sections.slice(1)) {
    try {
      const key = extractField(section, "key") ?? `unknown-${Date.now()}`;
      const pkg = extractField(section, "pkg") ?? "";
      const titleMatch = section.match(/android\.title=([^\n]*)/);
      const textMatch = section.match(/android\.text=([^\n]*)/);
      const subTextMatch = section.match(/android\.subText=([^\n]*)/);
      const whenMatch = section.match(/when=(\d+)/);
      const ongoingMatch = section.match(/flags=0x([0-9a-f]+)/);
      const flags = ongoingMatch ? parseInt(ongoingMatch[1], 16) : 0;

      const actionsRaw = section.match(/actions=\{(.+?)\}/s);
      const actions: string[] = [];
      if (actionsRaw) {
        const actionMatches = actionsRaw[1].matchAll(/title="([^"]+)"/g);
        for (const m of actionMatches) {
          actions.push(m[1]);
        }
      }

      notifications.push({
        key,
        packageName: pkg,
        title: titleMatch?.[1]?.trim() ?? "",
        text: textMatch?.[1]?.trim() ?? "",
        subText: subTextMatch?.[1]?.trim() ?? "",
        time: whenMatch ? parseInt(whenMatch[1]) : 0,
        actions,
        isOngoing: (flags & 0x02) !== 0,
        isClearable: (flags & 0x02) === 0,
      });
    } catch {
      // Skip unparseable notification
    }
  }

  return notifications;
}

function extractField(text: string, field: string): string | undefined {
  const regex = new RegExp(`${field}=([^\\s\\n]+)`);
  return regex.exec(text)?.[1];
}
