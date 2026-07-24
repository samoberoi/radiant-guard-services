import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (!existsSync("ios")) {
  run("npx", ["cap", "add", "ios"]);
}

if (!existsSync("android")) {
  run("npx", ["cap", "add", "android"]);
}

run("npx", ["cap", "sync"]);