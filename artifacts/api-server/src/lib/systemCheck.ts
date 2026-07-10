import os from "os";
import { execFileSync } from "child_process";

export interface SystemStatusInfo {
  isAppleSilicon: boolean;
  trainingBackendReady: boolean;
  simulationMode: boolean;
  platform: string;
  freeDiskGb: number;
  message: string;
}

function hasMlxLm(): boolean {
  try {
    execFileSync("python3", ["-c", "import mlx_lm"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getFreeDiskGb(): number {
  try {
    const output = execFileSync("df", ["-k", "."]).toString();
    const lines = output.trim().split("\n");
    const parts = lines[lines.length - 1]!.split(/\s+/);
    const availableKb = Number(parts[3]);
    if (Number.isNaN(availableKb)) return 0;
    return Math.round((availableKb / (1024 * 1024)) * 10) / 10;
  } catch {
    return 0;
  }
}

export function getSystemStatus(): SystemStatusInfo {
  const platform = os.platform();
  const arch = os.arch();
  const isAppleSilicon = platform === "darwin" && arch === "arm64";
  const mlxAvailable = isAppleSilicon && hasMlxLm();
  const freeDiskGb = getFreeDiskGb();

  let message: string;
  if (mlxAvailable) {
    message =
      "Running on Apple Silicon with MLX ready. Downloads and training will use your Mac's GPU.";
  } else if (isAppleSilicon) {
    message =
      "You're on a Mac, but MLX isn't installed yet. Install it with: pip install mlx-lm huggingface_hub, then restart this app.";
  } else {
    message =
      "This preview is running in the cloud, not on your Mac, so downloads and training are simulated here. Start this app on your own Mac to actually train models.";
  }

  return {
    isAppleSilicon,
    trainingBackendReady: mlxAvailable,
    simulationMode: !mlxAvailable,
    platform: `${platform}/${arch}`,
    freeDiskGb,
    message,
  };
}
