import { deviceLock } from "./device-lock.js";
import { notificationFilter } from "./notification-filter.js";
import { notificationQueue } from "./notification-queue.js";
import { screenIndicator } from "./screen-indicator.js";
import { scheduler } from "./scheduler.js";

export interface AppContext {
  deviceLock: typeof deviceLock;
  notificationFilter: typeof notificationFilter;
  notificationQueue: typeof notificationQueue;
  screenIndicator: typeof screenIndicator;
  scheduler: typeof scheduler;
}

let context: AppContext | null = null;

export function initAppContext(): AppContext {
  if (context) return context;

  screenIndicator.start();

  context = {
    deviceLock,
    notificationFilter,
    notificationQueue,
    screenIndicator,
    scheduler,
  };

  return context;
}

export function getAppContext(): AppContext {
  if (!context) throw new Error("App context not initialized. Call initAppContext() first.");
  return context;
}
