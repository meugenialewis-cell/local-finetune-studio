const LAST_PRESET_KEY = "finetune-studio:last-preset";

export function getLastUsedPresetId(): string | null {
  try {
    return localStorage.getItem(LAST_PRESET_KEY);
  } catch {
    return null;
  }
}

export function setLastUsedPresetId(presetId: string): void {
  try {
    localStorage.setItem(LAST_PRESET_KEY, presetId);
  } catch {
    // localStorage unavailable (private mode, etc.) — remembering the preset is best-effort
  }
}
