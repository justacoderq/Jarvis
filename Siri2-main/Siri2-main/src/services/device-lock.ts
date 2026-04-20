export type OwnerType = "user" | "notification-agent" | "scheduled-task";

export interface LockState {
  locked: boolean;
  owner: string | null;
  ownerType: OwnerType | null;
  acquiredAt: number | null;
}

type StateChangeCallback = (state: LockState) => void;

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

class DeviceLock {
  private owner: string | null = null;
  private ownerType: OwnerType | null = null;
  private acquiredAt: number | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<StateChangeCallback> = new Set();

  getState(): LockState {
    return {
      locked: this.owner !== null,
      owner: this.owner,
      ownerType: this.ownerType,
      acquiredAt: this.acquiredAt,
    };
  }

  acquire(owner: string, ownerType: OwnerType, timeoutMs = DEFAULT_TIMEOUT_MS): boolean {
    // Reentrant: same owner can re-acquire
    if (this.owner === owner) {
      this.resetTimeout(timeoutMs);
      return true;
    }

    // User always preempts notification-agent and scheduled-task
    if (this.owner !== null) {
      if (ownerType === "user" && (this.ownerType === "notification-agent" || this.ownerType === "scheduled-task")) {
        this.clearTimeout();
        this.owner = owner;
        this.ownerType = ownerType;
        this.acquiredAt = Date.now();
        this.resetTimeout(timeoutMs);
        this.notifyListeners();
        return true;
      }
      // Lock held by someone else, can't acquire
      return false;
    }

    // Lock is free
    this.owner = owner;
    this.ownerType = ownerType;
    this.acquiredAt = Date.now();
    this.resetTimeout(timeoutMs);
    this.notifyListeners();
    return true;
  }

  release(owner: string): boolean {
    if (this.owner !== owner) return false;
    this.clearTimeout();
    this.owner = null;
    this.ownerType = null;
    this.acquiredAt = null;
    this.notifyListeners();
    return true;
  }

  forceRelease(): void {
    this.clearTimeout();
    this.owner = null;
    this.ownerType = null;
    this.acquiredAt = null;
    this.notifyListeners();
  }

  isLockedBy(owner: string): boolean {
    return this.owner === owner;
  }

  isLocked(): boolean {
    return this.owner !== null;
  }

  /** Reset the auto-timeout — call on each tool use to keep the lock alive. */
  refresh(owner: string, timeoutMs = DEFAULT_TIMEOUT_MS): boolean {
    if (this.owner !== owner) return false;
    this.resetTimeout(timeoutMs);
    return true;
  }

  onStateChange(cb: StateChangeCallback): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const cb of this.listeners) {
      try { cb(state); } catch {}
    }
  }

  private resetTimeout(timeoutMs: number): void {
    this.clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      console.log("\x1b[33m[device-lock] Auto-timeout: releasing lock\x1b[0m");
      this.forceRelease();
    }, timeoutMs);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}

// Singleton
export const deviceLock = new DeviceLock();
