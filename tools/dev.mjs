import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BUILD_INPUT_FILES, BUILD_INPUT_DIRS } from "../build.mjs";
import { spawnOwned } from "./owned-process.mjs";
import { startWatching } from "./watch.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseDevOptions(args) {
  let port = 4173;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--port") throw new Error(`Unknown dev option: ${args[i]}`);
    const value = args[++i];
    if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
      throw new Error("--port requires an integer from 1 to 65535.");
    port = Number(value);
  }
  return { port };
}

export async function assertPortAvailable(port, host = "127.0.0.1") {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) =>
      reject(
        new Error(
          `Cannot start dev at http://${host}:${port}: ${error.message}. Choose another --port; no existing process was stopped.`,
        ),
      ),
    );
    probe.listen({ port, host, exclusive: true }, () => probe.close(resolve));
  });
}

export async function runDev({ port = 4173 } = {}) {
  await assertPortAvailable(port);
  const require = createRequire(import.meta.url);
  const wranglerPackage = require.resolve("wrangler/package.json");
  const wranglerCli = path.join(path.dirname(wranglerPackage), "bin", "wrangler.js");
  let signaled = false;
  let stop;
  let server;
  const stopped = new Promise((resolve) => {
    stop = () => {
      signaled = true;
      resolve();
    };
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const watching = startWatching({
    projectRoot,
    outputDirectory: path.join(projectRoot, "dist"),
    files: BUILD_INPUT_FILES,
    directories: BUILD_INPUT_DIRS,
  });
  try {
    await Promise.race([watching.ready, watching.failed, stopped]);
    if (signaled) return;
    server = spawnOwned(
      process.execPath,
      [
        wranglerCli,
        "pages",
        "dev",
        "dist",
        "--port",
        String(port),
        "--ip",
        "127.0.0.1",
        "--show-interactive-dev-session=false",
      ],
      { cwd: projectRoot, stdio: "inherit" },
    );
    console.log(`Watching published inputs. Local preview: http://127.0.0.1:${port}`);
    console.log(
      "Refresh after a successful rebuild. Ctrl+C stops this task's watcher and preview process.",
    );
    const result = await Promise.race([server.exited, watching.failed, stopped]);
    if (!signaled && result?.code !== 0)
      throw new Error(`Wrangler exited with ${result?.signal ?? result?.code}.`);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await Promise.all([watching.close(), server?.stop()]);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    await runDev(parseDevOptions(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
