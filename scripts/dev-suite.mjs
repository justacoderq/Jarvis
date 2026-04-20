import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const withMotion = process.argv.includes("--with-motion");

const processes = [
  {
    name: "jarvis-agent-server",
    cwd: fileURLToPath(new URL("../apps/jarvis-agent-server/", import.meta.url)),
    args: ["run", "dev:server"],
  },
  {
    name: "jarvis-control-web",
    cwd: fileURLToPath(new URL("../apps/jarvis-control-web/", import.meta.url)),
    args: ["run", "dev"],
    env: { PORT: "3001" },
  },
  {
    name: "jarvis-control-mastra",
    cwd: fileURLToPath(new URL("../apps/jarvis-control-web/", import.meta.url)),
    args: ["run", "dev:mastra"],
  },
];

if (withMotion) {
  processes.push({
    name: "jarvis-motion-web",
    cwd: fileURLToPath(new URL("../apps/jarvis-motion-web/", import.meta.url)),
    args: ["run", "dev"],
    env: { PORT: "3002" },
  });
}

const children = processes.map((proc) => {
  const env = {
    ...process.env,
    ...(proc.env || {}),
  };

  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", "npm", ...proc.args], {
        cwd: proc.cwd,
        stdio: "inherit",
        windowsVerbatimArguments: false,
        env,
      })
    : spawn("npm", proc.args, {
        cwd: proc.cwd,
        stdio: "inherit",
        env,
      });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${proc.name}] exited with code ${code}`);
    }
  });

  return child;
});

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
  process.exit(130);
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
  process.exit(143);
});

console.log("Suite backends started.");
console.log("JARVIS Control: http://localhost:3001/control");
console.log("JARVIS Agent:   http://127.0.0.1:3000/health");
if (withMotion) {
  console.log("JARVIS Motion:  http://localhost:3002");
}
console.log("");
console.log("Next steps:");
console.log("1. Run `adb reverse tcp:3001 tcp:3001` for JARVIS Control from the Android app.");
if (withMotion) {
  console.log("2. Run `adb reverse tcp:3002 tcp:3002` for JARVIS Motion from the Android app.");
  console.log("3. Run `flutter run` from apps/jarvis-mobile.");
} else {
  console.log("2. Run `flutter run` from apps/jarvis-mobile.");
}
