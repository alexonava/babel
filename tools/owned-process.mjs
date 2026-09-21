import { spawn } from "node:child_process";

// Only stop the PID/process group created here. Never discover or terminate
// a process by its name or by the port it happens to use.
export function spawnOwned(command, args, options = {}) {
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  let finished = false;
  const exited = new Promise((resolve, reject) => {
    child.once("error", (error) => {
      finished = true;
      reject(error);
    });
    child.once("exit", (code, signal) => {
      finished = true;
      resolve({ code, signal });
    });
  });
  let stopping;
  return {
    child,
    exited,
    stop() {
      return (stopping ??= (async () => {
        if (finished || !child.pid) return;
        if (process.platform === "win32") {
          await new Promise((resolve, reject) => {
            const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
            });
            killer.once("error", reject);
            killer.once("exit", (code) =>
              code === 0 || finished
                ? resolve()
                : reject(new Error(`Could not stop owned child ${child.pid}.`)),
            );
          });
        } else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
          const timeout = setTimeout(() => {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch (error) {
              if (error.code !== "ESRCH") console.error(error);
            }
          }, 3000);
          try {
            await exited;
          } finally {
            clearTimeout(timeout);
          }
        }
        await exited;
      })());
    },
  };
}
