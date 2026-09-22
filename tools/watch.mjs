import { statSync, watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawnOwned } from "./owned-process.mjs";

export function createRebuildQueue(
  rebuild,
  { debounceMs = 120, onError = console.error, onBuilt = () => {} } = {},
) {
  let timer;
  let pending = false;
  let running;
  let closed = false;
  let lastError;
  function drain() {
    if (running) return running;
    running = (async () => {
      while (pending && !closed) {
        clearTimeout(timer);
        pending = false;
        try {
          await rebuild();
          lastError = undefined;
          if (!closed) onBuilt();
        } catch (error) {
          lastError = error;
          if (!closed) onError(error);
        }
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  }
  return {
    request() {
      if (closed) return;
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(drain, debounceMs);
    },
    async flush() {
      if (closed) return;
      pending = true;
      clearTimeout(timer);
      await drain();
      if (lastError) throw lastError;
    },
    async close() {
      closed = true;
      pending = false;
      clearTimeout(timer);
      await running;
    },
  };
}

export function isBuildInput(filename, { files, directories }) {
  if (filename === null) return false;
  const relative = String(filename).replaceAll("\\", "/");
  return (
    files.includes(relative) ||
    directories.some((directory) => relative === directory || relative.startsWith(`${directory}/`))
  );
}

async function inputSignature(projectRoot, files, directories) {
  const entries = [];
  async function inspect(relative) {
    const absolute = path.join(projectRoot, relative);
    let info;
    try {
      info = await stat(absolute, { bigint: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        entries.push(`${relative}:missing`);
        return;
      }
      throw error;
    }
    if (info.isDirectory()) {
      entries.push(`${relative}:directory`);
      for (const name of (await readdir(absolute)).sort()) await inspect(path.join(relative, name));
    } else {
      entries.push(`${relative}:${info.size}:${info.mtimeNs}`);
    }
  }
  for (const relative of [...files, ...directories]) await inspect(relative);
  return entries.join("\n");
}

// Root files need their parent watched so editor save-by-rename works. That
// parent watcher is deliberately nonrecursive; only declared input directories
// receive recursive watchers. Windows can report a null filename for unrelated
// directory metadata, so confirm input changes instead of rebuilding blindly.
function watchInputs(projectRoot, files, directories, changed, failed) {
  const directoryWatchers = new Map();
  function refreshDirectories() {
    for (const directory of directories) {
      const absolute = path.join(projectRoot, directory);
      let identity;
      try {
        const info = statSync(absolute);
        if (info.isDirectory()) identity = `${info.dev}:${info.ino}`;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const previous = directoryWatchers.get(directory);
      if (previous?.identity === identity) continue;
      previous?.watcher.close();
      directoryWatchers.delete(directory);
      if (identity) {
        const watcher = watch(absolute, { recursive: true }, changed);
        watcher.on("error", failed);
        directoryWatchers.set(directory, { identity, watcher });
      }
    }
  }
  const parentWatcher = watch(projectRoot, { recursive: false }, (_event, filename) => {
    if (filename !== null && !isBuildInput(filename, { files, directories })) return;
    try {
      refreshDirectories();
      changed();
    } catch (error) {
      failed(error);
    }
  });
  parentWatcher.on("error", failed);
  try {
    refreshDirectories();
  } catch (error) {
    parentWatcher.close();
    for (const { watcher } of directoryWatchers.values()) watcher.close();
    throw error;
  }
  return () => {
    parentWatcher.close();
    for (const { watcher } of directoryWatchers.values()) watcher.close();
  };
}

export function startWatching({
  projectRoot,
  outputDirectory,
  files,
  directories,
  debounceMs = 120,
  onBuilt = () => console.log("rebuilt site; refresh your browser"),
  onError = (error) =>
    console.error("Build failed; keeping the last successful output.\n", error.message),
}) {
  let builder;
  let closing;
  let signature;
  const queue = createRebuildQueue(
    async () => {
      builder = spawnOwned(
        process.execPath,
        [
          path.join(projectRoot, "build.mjs"),
          "--dist",
          "--outdir",
          outputDirectory,
          "--retain-assets",
        ],
        { cwd: projectRoot, stdio: "inherit" },
      );
      const result = await builder.exited;
      builder = undefined;
      if (result.code !== 0)
        throw new Error(`Builder exited with ${result.signal ?? result.code}.`);
    },
    { debounceMs, onBuilt, onError },
  );
  let rejectWatching;
  const failed = new Promise((_resolve, reject) => {
    rejectWatching = reject;
  });
  const checks = createRebuildQueue(
    async () => {
      const next = await inputSignature(projectRoot, files, directories);
      if (signature !== undefined && signature !== next) queue.request();
      signature = next;
    },
    { debounceMs, onError: rejectWatching },
  );
  const closeInputs = watchInputs(
    projectRoot,
    files,
    directories,
    () => checks.request(),
    rejectWatching,
  );
  // Callers race this with shutdown; attach immediately so an early watcher
  // error never becomes an unhandled rejection during the initial build.
  failed.catch(() => {});
  return {
    ready: (async () => {
      signature = await inputSignature(projectRoot, files, directories);
      await queue.flush();
    })(),
    failed,
    close() {
      return (closing ??= (async () => {
        closeInputs();
        await checks.close();
        const idle = queue.close();
        await builder?.stop();
        await idle;
      })());
    },
  };
}

export async function runWatch(options) {
  const watching = startWatching(options);
  let signaled = false;
  let stop;
  const stopped = new Promise((resolve) => {
    stop = () => {
      signaled = true;
      resolve();
    };
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await Promise.race([watching.ready, stopped]);
    if (!signaled) {
      console.log("watching published HTML, CSS, JavaScript, fonts, images, and static files");
      await Promise.race([watching.failed, stopped]);
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await watching.close();
  }
}
