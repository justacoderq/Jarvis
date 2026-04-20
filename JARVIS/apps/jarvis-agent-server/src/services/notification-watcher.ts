import { EventEmitter } from "node:events";
import { executeShell } from "./shell-executor.js";
import type { NotificationInfo } from "../types/notification.js";

export class NotificationWatcher extends EventEmitter {
  private interval: ReturnType<typeof setInterval> | null = null;
  private previousKeys = new Set<string>();

  start(pollIntervalMs = 5000): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.poll(), pollIntervalMs);
    void this.poll();
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
      const currentKeys = new Set(notifications.map((notification) => notification.key));

      for (const notification of notifications) {
        if (!this.previousKeys.has(notification.key)) {
          this.emit("new", notification);
        }
      }

      for (const key of this.previousKeys) {
        if (!currentKeys.has(key)) {
          this.emit("removed", key);
        }
      }

      this.previousKeys = currentKeys;
    } catch {
      // Ignore watcher polling errors and try again next interval.
    }
  }
}

export async function getNotifications(): Promise<NotificationInfo[]> {
  const dumpsys = await executeShell("dumpsys notification --noredact", {
    timeout: 15_000,
  });

  let notifications = parseNotificationDump(dumpsys.stdout || "");
  if (notifications.length > 0) {
    return notifications;
  }

  // Fallback: some devices expose a shorter but still useful list via cmd.
  const cmdList = await executeShell("cmd notification list --noredact", {
    timeout: 10_000,
  });
  notifications = parseNotificationDump(cmdList.stdout || "");
  return notifications;
}

function parseNotificationDump(dump: string): NotificationInfo[] {
  if (!dump.trim()) return [];

  const notifications: NotificationInfo[] = [];
  const sections = dump
    .split(/NotificationRecord\(/)
    .map((section) => section.trim())
    .filter(Boolean);

  for (const section of sections) {
    try {
      const key =
        extractField(section, "key") ??
        extractWithRegex(section, /key=(.+)/)?.split(/\s+/)[0] ??
        `unknown-${Date.now()}-${notifications.length}`;
      const packageName =
        extractField(section, "pkg") ??
        extractWithRegex(section, /\bpackage=([^\s]+)/) ??
        "";

      const title =
        firstNonEmpty([
          extractAndroidExtra(section, "title"),
          extractAndroidExtra(section, "title.big"),
          extractAndroidExtra(section, "conversationTitle"),
          extractAndroidExtra(section, "summaryText"),
          extractWithRegex(section, /tickerText=([^\n]+)/),
        ]) ?? "";

      const text =
        firstNonEmpty([
          extractAndroidExtra(section, "text"),
          extractAndroidExtra(section, "bigText"),
          extractAndroidExtra(section, "subText"),
          extractAndroidExtra(section, "summaryText"),
          extractWithRegex(section, /android\.messages=\[([^\]]+)/),
        ]) ?? "";

      const subText = firstNonEmpty([
        extractAndroidExtra(section, "subText"),
        extractAndroidExtra(section, "summaryText"),
      ]) ?? "";

      const whenRaw = extractWithRegex(section, /when=(\d+)/);
      const flagsRaw = extractWithRegex(section, /flags=0x([0-9a-fA-F]+)/);
      const flags = flagsRaw ? parseInt(flagsRaw, 16) : 0;
      const actions = extractActions(section);

      // Ignore obviously empty shell entries.
      if (!packageName && !title && !text) {
        continue;
      }

      notifications.push({
        key,
        packageName,
        title: cleanValue(title),
        text: cleanValue(text),
        subText: cleanValue(subText),
        time: whenRaw ? parseInt(whenRaw, 10) : 0,
        actions,
        isOngoing: (flags & 0x02) !== 0,
        isClearable: (flags & 0x02) === 0,
      });
    } catch {
      // Skip unparseable notification blocks.
    }
  }

  return dedupeNotifications(notifications);
}

function extractField(text: string, field: string): string | undefined {
  return extractWithRegex(text, new RegExp(`${field}=([^\\s\\n]+)`));
}

function extractWithRegex(text: string, regex: RegExp): string | undefined {
  return regex.exec(text)?.[1]?.trim();
}

function extractAndroidExtra(section: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`android\\.${escapeRegex(key)}=([^\\n]+)`),
    new RegExp(`android\\.${escapeRegex(key)}=String \\(([^\\)]*)\\)`),
    new RegExp(`android\\.${escapeRegex(key)}=CharSequence \\(([^\\)]*)\\)`),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(section)?.[1]?.trim();
    if (match) {
      return match;
    }
  }
  return undefined;
}

function extractActions(section: string): string[] {
  const actions = new Set<string>();
  const actionTitles = section.matchAll(/title="?([^"\n]+)"?/g);
  for (const match of actionTitles) {
    const title = cleanValue(match[1]);
    if (title && title.length < 80) {
      actions.add(title);
    }
  }
  return [...actions];
}

function dedupeNotifications(notifications: NotificationInfo[]): NotificationInfo[] {
  const seen = new Set<string>();
  const unique: NotificationInfo[] = [];

  for (const notification of notifications) {
    const dedupeKey = `${notification.packageName}|${notification.title}|${notification.text}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    unique.push(notification);
  }

  return unique;
}

function cleanValue(value: string): string {
  return value
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  return values.find((value) => value != null && value.trim().length > 0);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
