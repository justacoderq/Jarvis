import { deviceLock, type LockState } from "./device-lock.js";
import { executeShell } from "./shell-executor.js";

const NOTIFICATION_ID = "siri2_agent_active";
const NOTIFICATION_TAG = "siri2_lock";

class ScreenIndicator {
  private unsubscribe: (() => void) | null = null;
  private shown = false;

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = deviceLock.onStateChange((state) => this.onLockChange(state));
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.shown) {
      this.hideNotification();
    }
  }

  private async onLockChange(state: LockState): Promise<void> {
    if (state.locked) {
      if (!this.shown) await this.showNotification();
    } else {
      if (this.shown) await this.hideNotification();
    }
  }

  private async showNotification(): Promise<void> {
    this.shown = true;

    // Try termux-notification first (has action button support)
    const termuxCheck = await executeShell("which termux-notification", { asRoot: false, timeout: 3000 });
    if (termuxCheck.exitCode === 0) {
      await executeShell(
        `termux-notification ` +
        `--id "${NOTIFICATION_ID}" ` +
        `--title "Siri2 Agent Active" ` +
        `--content "The notification agent is controlling the device" ` +
        `--ongoing ` +
        `--button1 "Take Back Control" ` +
        `--button1-action 'curl -s -X POST http://localhost:3000/lock/release'`,
        { asRoot: false, timeout: 5000 }
      );
      return;
    }

    // Fallback: cmd notification post (no action button)
    await executeShell(
      `cmd notification post -t "Siri2 Agent Active" ` +
      `"${NOTIFICATION_TAG}" "The notification agent is controlling the device"`,
      { timeout: 5000 }
    );
  }

  private async hideNotification(): Promise<void> {
    this.shown = false;

    const termuxCheck = await executeShell("which termux-notification", { asRoot: false, timeout: 3000 });
    if (termuxCheck.exitCode === 0) {
      await executeShell(
        `termux-notification-remove "${NOTIFICATION_ID}"`,
        { asRoot: false, timeout: 5000 }
      );
      return;
    }

    await executeShell(
      `cmd notification cancel "${NOTIFICATION_TAG}"`,
      { timeout: 5000 }
    );
  }
}

export const screenIndicator = new ScreenIndicator();
