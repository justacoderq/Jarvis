import { exec } from "node:child_process";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellOptions {
  timeout?: number;
  maxBuffer?: number;
  asRoot?: boolean;
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_MAX_BUFFER = 5 * 1024 * 1024; // 5MB for uiautomator output
let rootShellAvailability: boolean | null = null;

export function executeShell(
  command: string,
  options: ShellOptions = {}
): Promise<ShellResult> {
  const {
    timeout = DEFAULT_TIMEOUT,
    maxBuffer = DEFAULT_MAX_BUFFER,
    asRoot = true,
  } = options;

  return new Promise((resolve) => {
    const runWrapped = (preferRoot: boolean, onDone: (result: ShellResult) => void) => {
      const wrappedCommand = buildWrappedCommand(command, preferRoot);
      exec(wrappedCommand, { timeout, maxBuffer }, (error, stdout, stderr) => {
        onDone({
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? "",
          exitCode: error?.code ?? 0,
        });
      });
    };

    const shouldTryRoot = asRoot && rootShellAvailability !== false;
    runWrapped(shouldTryRoot, (result) => {
      if (shouldTryRoot && looksLikeMissingSu(result)) {
        rootShellAvailability = false;
        runWrapped(false, resolve);
        return;
      }

      if (shouldTryRoot && result.exitCode === 0) {
        rootShellAvailability = true;
      }

      resolve(result);
    });
  });
}

function buildWrappedCommand(command: string, asRoot: boolean): string {
  const shellCommand = `sh -c "unset LD_LIBRARY_PATH; ${command.replace(/"/g, '\\"')}"`;
  return asRoot ? `su -c ${shellQuote(shellCommand)}` : shellCommand;
}

function looksLikeMissingSu(result: ShellResult): boolean {
  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return (
    combined.includes("su: not found") ||
    combined.includes("'su' is not recognized") ||
    combined.includes("su: inaccessible") ||
    combined.includes("permission denied")
  );
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
