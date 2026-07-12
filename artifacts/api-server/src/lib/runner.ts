import { spawn } from "child_process";
import path from "path";

export interface PyEvent {
  type: "progress" | "done" | "error" | "token";
  [key: string]: unknown;
}

const SCRIPTS_DIR = path.join(process.cwd(), "scripts");

/**
 * Lines in stderr that are known library noise, not the reason a process
 * failed. The big offender in the wild: urllib3's NotOpenSSLWarning on Macs
 * whose system Python links LibreSSL — it fires on `import mlx_lm` and used
 * to fill the entire error message shown to the user.
 */
const STDERR_NOISE = [
  /NotOpenSSLWarning/,
  /DeprecationWarning/,
  /FutureWarning/,
  /UserWarning/,
  /^\s*warnings\.warn\b/,
];

/** Drops known warning-noise lines (and their `warnings.warn(...)` trailers)
 * from stderr, returning the meaningful tail that explains a failure. */
export function meaningfulStderrTail(stderr: string, maxChars = 500): string {
  const kept = stderr
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !STDERR_NOISE.some((re) => re.test(trimmed));
    })
    .join("\n")
    .trim();
  // Python puts the actual error (traceback's final line) at the END of
  // stderr, so keep the tail — never the head.
  return kept.length > maxChars ? `…${kept.slice(-maxChars)}` : kept;
}

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
  const child = spawn("python3", [scriptPath, ...args], {
    cwd: process.cwd(),
    // Silence Python library warnings at the source so stderr only carries
    // real failures. Propagates to nested subprocesses (e.g. mlx_lm.fuse).
    env: { ...process.env, PYTHONWARNINGS: "ignore" },
  });

  // Scripts report failures themselves via {"type":"error"} JSON events with
  // human-readable messages. Only synthesize a fallback error from stderr
  // when the script died without telling us why.
  let scriptReportedOutcome = false;

  const handleEvent = (event: PyEvent) => {
    if (event.type === "error" || event.type === "done") scriptReportedOutcome = true;
    onEvent(event);
  };

  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf-8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        handleEvent(JSON.parse(trimmed) as PyEvent);
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
        handleEvent(JSON.parse(buffer.trim()) as PyEvent);
      } catch {
        // ignore trailing partial line
      }
    }
    if (code !== 0 && code !== null && !scriptReportedOutcome) {
      const detail = meaningfulStderrTail(stderr);
      onEvent({
        type: "error",
        message: detail
          ? `Local process exited unexpectedly (code ${code}). Details: ${detail}`
          : `Local process exited unexpectedly (code ${code}) without reporting a reason.`,
      });
    }
    onExit(code);
  });

  return child;
}
