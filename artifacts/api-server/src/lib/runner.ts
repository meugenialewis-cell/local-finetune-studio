import { spawn } from "child_process";
import path from "path";

export interface PyEvent {
  type: "progress" | "done" | "error" | "token";
  [key: string]: unknown;
}

const SCRIPTS_DIR = path.join(process.cwd(), "scripts");

/**
 * Spawns a python script from ./scripts and streams its JSON-lines stdout
 * output to `onEvent`. Used for the real local execution path on the user's
 * own Apple Silicon Mac (see systemCheck.getSystemStatus().trainingBackendReady).
 * Callers must have already verified the backend is ready; if the script
 * still fails (e.g. an unsupported mlx-lm version), it emits a `type: "error"`
 * event with a human-readable message rather than a raw stack trace.
 */
export function runPythonScript(
  scriptName: string,
  args: string[],
  onEvent: (event: PyEvent) => void,
  onExit: (code: number | null) => void,
) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const child = spawn("python3", [scriptPath, ...args], { cwd: process.cwd() });

  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf-8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed) as PyEvent);
      } catch {
        // Non-JSON stdout noise (e.g. library warnings) — ignore.
      }
    }
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf-8");
  });

  child.on("error", (err) => {
    onEvent({ type: "error", message: `Could not start local training process: ${err.message}` });
    onExit(1);
  });

  child.on("close", (code) => {
    if (buffer.trim()) {
      try {
        onEvent(JSON.parse(buffer.trim()) as PyEvent);
      } catch {
        // ignore trailing partial line
      }
    }
    if (code !== 0 && code !== null && stderr.trim()) {
      onEvent({ type: "error", message: `Local process exited unexpectedly. Details: ${stderr.trim().slice(0, 500)}` });
    }
    onExit(code);
  });

  return child;
}
