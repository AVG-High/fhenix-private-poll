// Keep tool configuration/cache inside this project; do not touch the user's home.
const path = require("node:path");
const fs = require("node:fs");
const taskRuntime = path.resolve(__dirname, "../.local-runtime");
fs.mkdirSync(taskRuntime, { recursive: true });
process.env.APPDATA = path.join(taskRuntime, "config");
process.env.LOCALAPPDATA = path.join(taskRuntime, "data");
process.env.XDG_CONFIG_HOME = path.join(taskRuntime, "config");
process.env.XDG_CACHE_HOME = path.join(taskRuntime, "cache");
process.env.XDG_DATA_HOME = path.join(taskRuntime, "data");
process.env.HARDHAT_DISABLE_TELEMETRY_PROMPT = "true";
require("hardhat/internal/cli/cli");
