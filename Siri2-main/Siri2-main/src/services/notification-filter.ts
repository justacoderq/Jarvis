import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".siri2");
const CONFIG_PATH = join(CONFIG_DIR, "notification-filter.json");

class NotificationFilter {
  private whitelist: Set<string> = new Set();

  constructor() {
    this.load();
  }

  isAllowed(packageName: string): boolean {
    return this.whitelist.has(packageName);
  }

  getWhitelist(): string[] {
    return [...this.whitelist];
  }

  setWhitelist(packages: string[]): void {
    this.whitelist = new Set(packages);
    this.save();
  }

  addPackage(pkg: string): void {
    this.whitelist.add(pkg);
    this.save();
  }

  removePackage(pkg: string): void {
    this.whitelist.delete(pkg);
    this.save();
  }

  save(): void {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_PATH, JSON.stringify({ packages: [...this.whitelist] }, null, 2), "utf-8");
  }

  load(): void {
    try {
      if (existsSync(CONFIG_PATH)) {
        const data = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
        this.whitelist = new Set(data.packages || []);
      }
    } catch {
      this.whitelist = new Set();
    }
  }
}

export const notificationFilter = new NotificationFilter();
