import type { DocBlock } from "./documentExtractor";
import type { ParsedRow } from "./datasetParser";

export type DocumentConversionMode = "smart" | "verbatim";

export interface ConversionOutcome {
  rows: ParsedRow[];
  warnings: string[];
  error: string | null;
}

// Explicit labels the user can put in their own document to define pairs exactly.
const PROMPT_LABEL = /^(?:prompt|question|instruction|input|q)\s*[:：]\s*/i;
const RESPONSE_LABEL = /^(?:response|answer|output|completion|a)\s*[:：]\s*/i;

// Smart-mode sizing. Values are characters.
const TINY_SECTION = 80;
const MAX_CHUNK = 2000;
const TARGET_CHUNK = 1200;

interface Section {
  heading: string | null;
  body: string[];
}

function hasExplicitLabels(blocks: DocBlock[]): boolean {
  let sawPrompt = false;
  let sawResponse = false;
  for (const block of blocks) {
    if (block.kind !== "paragraph") continue;
    if (PROMPT_LABEL.test(block.text)) sawPrompt = true;
    else if (RESPONSE_LABEL.test(block.text)) sawResponse = true;
    if (sawPrompt && sawResponse) return true;
  }
  return false;
}

function pairFromLabels(blocks: DocBlock[]): ConversionOutcome {
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  let promptParts: string[] = [];
  let responseParts: string[] = [];
  let collecting: "prompt" | "response" | null = null;
  let skippedPreamble = 0;
  let ignoredHeadings = 0;
  let incomplete = 0;

  const flush = () => {
    const prompt = promptParts.join("\n\n").trim();
    const response = responseParts.join("\n\n").trim();
    if (prompt && response) {
      rows.push({ prompt, response });
    } else if (prompt || response) {
      incomplete++;
    }
    promptParts = [];
    responseParts = [];
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      ignoredHeadings++;
      continue;
    }
    const text = block.text;
    if (PROMPT_LABEL.test(text)) {
      flush();
      collecting = "prompt";
      promptParts.push(text.replace(PROMPT_LABEL, "").trim());
    } else if (RESPONSE_LABEL.test(text)) {
      collecting = "response";
      responseParts.push(text.replace(RESPONSE_LABEL, "").trim());
    } else if (collecting === "prompt") {
      promptParts.push(text);
    } else if (collecting === "response") {
      responseParts.push(text);
    } else {
      skippedPreamble++;
    }
  }
  flush();

  if (ignoredHeadings > 0) {
    warnings.push("Headings were ignored because the document uses Prompt/Response labels to define the examples.");
  }
  if (skippedPreamble > 0) {
    warnings.push(`${skippedPreamble} paragraph${skippedPreamble === 1 ? "" : "s"} before the first label ${skippedPreamble === 1 ? "was" : "were"} skipped.`);
  }
  if (incomplete > 0) {
    warnings.push(`${incomplete} labeled entr${incomplete === 1 ? "y" : "ies"} had a prompt without a response (or vice versa) and ${incomplete === 1 ? "was" : "were"} skipped.`);
  }
  if (rows.length === 0) {
    return {
      rows: [],
      warnings,
      error: 'No complete pairs were found. Make sure each "Prompt:" (or "Question:") is followed by a "Response:" (or "Answer:").',
    };
  }
  return { rows, warnings, error: null };
}

function groupIntoSections(blocks: DocBlock[]): { preamble: string[]; sections: Section[] } {
  const preamble: string[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const block of blocks) {
    if (block.kind === "heading") {
      current = { heading: block.text, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(block.text);
    } else {
      preamble.push(block.text);
    }
  }
  return { preamble, sections };
}

function splitLongText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/\n\n/);
  const chunks: string[] = [];
  let current = "";
  for (let para of paragraphs) {
    // Hard-split any single paragraph that alone exceeds the limit.
    while (para.length > maxChars) {
      let cut = para.lastIndexOf(" ", maxChars);
      if (cut < maxChars / 2) cut = maxChars;
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(para.slice(0, cut).trim());
      para = para.slice(cut).trim();
    }
    if (current && current.length + para.length + 2 > maxChars) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 0);
}

function chunkParagraphs(paragraphs: string[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > TARGET_CHUNK) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);
  return chunks.flatMap((c) => splitLongText(c, MAX_CHUNK));
}

function convertVerbatim(blocks: DocBlock[]): ConversionOutcome {
  if (hasExplicitLabels(blocks)) {
    return pairFromLabels(blocks);
  }

  const { preamble, sections } = groupIntoSections(blocks);
  if (sections.length === 0) {
    return {
      rows: [],
      warnings: [],
      error:
        'As-is conversion needs structure to know where each example starts. Add headings (Word heading styles or Markdown "#" lines), or label pairs with "Prompt:" and "Response:". Alternatively, switch to Smart splitting.',
    };
  }

  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  if (preamble.length > 0) {
    warnings.push(`${preamble.length} paragraph${preamble.length === 1 ? "" : "s"} before the first heading ${preamble.length === 1 ? "was" : "were"} skipped.`);
  }
  let emptySections = 0;
  for (const section of sections) {
    const response = section.body.join("\n\n").trim();
    if (!response) {
      emptySections++;
      continue;
    }
    rows.push({ prompt: section.heading!, response });
  }
  if (emptySections > 0) {
    warnings.push(`${emptySections} heading${emptySections === 1 ? "" : "s"} with no text underneath ${emptySections === 1 ? "was" : "were"} skipped.`);
  }
  if (rows.length === 0) {
    return { rows: [], warnings, error: "Every heading in this document was empty — there was no text to pair with them." };
  }
  return { rows, warnings, error: null };
}

function convertSmart(blocks: DocBlock[], docTitle: string): ConversionOutcome {
  if (hasExplicitLabels(blocks)) {
    return pairFromLabels(blocks);
  }

  const { preamble, sections } = groupIntoSections(blocks);
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];

  const addChunkedRows = (paragraphs: string[], title: string) => {
    const chunks = chunkParagraphs(paragraphs);
    const total = chunks.length;
    chunks.forEach((chunk, i) => {
      const prompt = total === 1 ? `Write "${title}".` : `Write part ${i + 1} of ${total} of "${title}".`;
      rows.push({ prompt, response: chunk });
    });
  };

  if (sections.length === 0) {
    if (preamble.length === 0) {
      return { rows: [], warnings, error: "No text could be found in this document." };
    }
    addChunkedRows(preamble, docTitle);
    return { rows, warnings, error: null };
  }

  if (preamble.length > 0) {
    addChunkedRows(preamble, docTitle);
  }

  for (const section of sections) {
    const body = section.body.join("\n\n").trim();
    if (!body) continue;
    if (body.length < TINY_SECTION && rows.length > 0) {
      // Merge tiny fragments into the previous example instead of creating noise rows.
      const prev = rows[rows.length - 1]!;
      prev.response = `${prev.response}\n\n${section.heading}\n${body}`;
      continue;
    }
    const chunks = splitLongText(body, MAX_CHUNK);
    const total = chunks.length;
    chunks.forEach((chunk, i) => {
      const prompt = total === 1 ? section.heading! : `${section.heading} (part ${i + 1} of ${total})`;
      rows.push({ prompt, response: chunk });
    });
  }

  if (rows.length === 0) {
    return { rows: [], warnings, error: "Every section in this document was empty — there was no text to convert." };
  }
  return { rows, warnings, error: null };
}

export function convertBlocksToRows(
  blocks: DocBlock[],
  mode: DocumentConversionMode,
  docTitle: string,
): ConversionOutcome {
  return mode === "verbatim" ? convertVerbatim(blocks) : convertSmart(blocks, docTitle);
}
