import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ToolResult } from "./types";

const execFileAsync = promisify(execFile);

export class AdbWrapper {
  private serial?: string;

  constructor(serial?: string) {
    this.serial = serial;
  }

  async runAdb(args: string[], opts?: { timeoutMs?: number }): Promise<ToolResult<string>> {
    try {
      const finalArgs = this.serial ? ["-s", this.serial, ...args] : args;
      const { stdout } = await execFileAsync("adb", finalArgs, {
        timeout: opts?.timeoutMs ?? 15_000,
        maxBuffer: 20 * 1024 * 1024,
      });
      return { ok: true, data: stdout.toString() };
    } catch (error: any) {
      return { 
        ok: false, 
        error: error?.message || "ADB command failed" 
      };
    }
  }

  async getFirstDeviceSerial(): Promise<ToolResult<string>> {
    try {
      const result = await this.runAdb(["devices", "-l"]);
      if (!result.ok || !result.data) {
        return { ok: false, error: "Failed to get device list" };
      }

      const lines = result.data
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.toLowerCase().includes("list of devices"));

      if (!lines.length) {
        return { ok: false, error: "No devices found. Plug in a device or start an emulator." };
      }

      const [serial, state] = lines[0].split(/\s+/);
      if (state !== "device") {
        console.warn(`Warning: first device state is '${state}'.`);
      }

      return { ok: true, data: serial };
    } catch (error: any) {
      return { ok: false, error: error?.message || "Failed to get device serial" };
    }
  }

  setSerial(serial: string) {
    this.serial = serial;
  }
}