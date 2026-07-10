export interface ParsedRow {
  prompt: string;
  response: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  error: string | null;
}

function coerceRow(obj: Record<string, unknown>): ParsedRow | null {
  const promptKey = ["prompt", "instruction", "input", "question"].find(
    (k) => typeof obj[k] === "string" && (obj[k] as string).trim().length > 0,
  );
  const responseKey = ["response", "output", "completion", "answer"].find(
    (k) => typeof obj[k] === "string" && (obj[k] as string).trim().length > 0,
  );
  if (!promptKey || !responseKey) return null;
  return { prompt: obj[promptKey] as string, response: obj[responseKey] as string };
}

function parseJsonl(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { rows: [], error: "The file is empty." };
  }
  for (let i = 0; i < lines.length; i++) {
    let obj: unknown;
    try {
      obj = JSON.parse(lines[i]!);
    } catch {
      return { rows: [], error: `Line ${i + 1} isn't valid JSON. Each line must be one JSON object, e.g. {"prompt": "...", "response": "..."}.` };
    }
    if (typeof obj !== "object" || obj === null) {
      return { rows: [], error: `Line ${i + 1} must be a JSON object with "prompt" and "response" fields.` };
    }
    const row = coerceRow(obj as Record<string, unknown>);
    if (!row) {
      return { rows: [], error: `Line ${i + 1} is missing a recognizable prompt/response pair. Expected fields like "prompt" and "response".` };
    }
    rows.push(row);
  }
  return { rows, error: null };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], error: "The file needs a header row plus at least one data row." };
  }
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const promptIdx = headers.findIndex((h) => ["prompt", "instruction", "input", "question"].includes(h));
  const responseIdx = headers.findIndex((h) => ["response", "output", "completion", "answer"].includes(h));
  if (promptIdx === -1 || responseIdx === -1) {
    return {
      rows: [],
      error: 'The header row must include a prompt-like column (e.g. "prompt") and a response-like column (e.g. "response").',
    };
  }
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const prompt = cells[promptIdx]?.trim();
    const response = cells[responseIdx]?.trim();
    if (!prompt || !response) {
      return { rows: [], error: `Row ${i + 1} is missing a prompt or response value.` };
    }
    rows.push({ prompt, response });
  }
  return { rows, error: null };
}

export function parseDataset(filename: string, buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8");
  const isJsonl = filename.toLowerCase().endsWith(".jsonl") || filename.toLowerCase().endsWith(".json");
  const isCsv = filename.toLowerCase().endsWith(".csv");

  if (!isJsonl && !isCsv) {
    return { rows: [], error: "Unsupported file type. Please upload a .csv or .jsonl file." };
  }

  const result = isJsonl ? parseJsonl(text) : parseCsv(text);
  if (result.error) return result;
  if (result.rows.length === 0) {
    return { rows: [], error: "No usable rows were found in this file." };
  }
  return result;
}
