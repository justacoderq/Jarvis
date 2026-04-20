import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const withJiggle = process.argv.includes("--with-jiggle");

const processes = [
  {
    name: "siri2-server",
    cwd: fileURLToPath(new URL("../apps/siri2-server/", import.meta.url)),
    args: ["run", "dev:server"],
  },
  {
    name: "phonepilot-web",
    cwd: fileURLToPath(new URL("../apps/phonepilot-web/", import.meta.url)),
    args: ["run", "dev"],
    env: { PORT: "3001" },
  },
  {
    name: "phonepilot-mastra",
    cwd: fileURLToPath(new URL("../apps/phonepilot-web/", import.meta.url)),
    args: ["run", "dev:mastra"],
  },
];

if (withJiggle) {
  processes.push({
    name: "jigglewiggle-web",
    cwd: fileURLToPath(new URL("../apps/jigglewiggle-web/", import.meta.url)),
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
console.log("PhonePilot web: http://localhost:3001/phonepilot");
console.log("Siri2 server:   http://127.0.0.1:3000/health");
if (withJiggle) {
  console.log("JiggleWiggle:   http://localhost:3002");
}
console.log("");
console.log("Next steps:");
console.log("1. Run `adb reverse tcp:3001 tcp:3001` for PhonePilot from the Android app.");
if (withJiggle) {
  console.log("2. Run `adb reverse tcp:3002 tcp:3002` for JiggleWiggle from the Android app.");
  console.log("3. Run `flutter run` from apps/jarvis-mobile.");
} else {
  console.log("2. Run `flutter run` from apps/jarvis-mobile.");
}
