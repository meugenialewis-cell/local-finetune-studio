import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { logger } from "./logger";

/**
 * A block of document content preserving the document's own structure.
 * Headings carry their level (1-6); paragraphs use level 0.
 */
export interface DocBlock {
  kind: "heading" | "paragraph";
  level: number;
  text: string;
}

export interface ExtractionResult {
  blocks: DocBlock[];
  warnings: string[];
  error: string | null;
}

const SUPPORTED_EXTENSIONS = [".docx", ".pdf", ".txt", ".md", ".markdown"];

export function isSupportedDocument(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function htmlBlockToText(inner: string): string {
  const withBreaks = inner.replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(stripped).replace(/[ \t]+/g, " ").trim();
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  let html: string;
  const warnings: string[] = [];
  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = result.value;
  } catch {
    return {
      blocks: [],
      warnings: [],
      error: "This Word document couldn't be read. Make sure it's a valid .docx file (older .doc files aren't supported — re-save as .docx).",
    };
  }

  const blocks: DocBlock[] = [];
  const blockRegex = /<(h[1-6]|p|li|td|th)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1]!.toLowerCase();
    const text = htmlBlockToText(match[2]!);
    if (!text) continue;
    if (tag.startsWith("h")) {
      blocks.push({ kind: "heading", level: parseInt(tag[1]!, 10), text });
    } else {
      blocks.push({ kind: "paragraph", level: 0, text });
    }
  }

  if (blocks.length === 0) {
    // Fall back to stripping all markup in case the document used unusual structure.
    const fallback = htmlBlockToText(html);
    if (fallback) {
      for (const para of fallback.split(/\n\s*\n/)) {
        const text = para.trim();
        if (text) blocks.push({ kind: "paragraph", level: 0, text });
      }
      warnings.push("The document structure couldn't be fully detected, so text was extracted as plain paragraphs.");
    }
  }

  if (blocks.length === 0) {
    return { blocks: [], warnings, error: "No text could be found in this Word document. It may be empty or contain only images." };
  }
  return { blocks, warnings, error: null };
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const warnings: string[] = [];
  const blocks: DocBlock[] = [];
  try {
    const result = await parser.getText();
    const emptyPages: number[] = [];
    for (const page of result.pages) {
      const pageText = page.text ?? "";
      if (!pageText.trim()) {
        emptyPages.push(page.num);
        continue;
      }
      for (const rawPara of pageText.split(/\n\s*\n/)) {
        // Line breaks inside a PDF paragraph are layout artifacts — join them.
        const text = rawPara.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim();
        if (text) blocks.push({ kind: "paragraph", level: 0, text });
      }
    }
    if (emptyPages.length > 0 && blocks.length > 0) {
      warnings.push(
        emptyPages.length === 1
          ? `Page ${emptyPages[0]} had no extractable text (it may be an image) and was skipped.`
          : `${emptyPages.length} pages had no extractable text (they may be images) and were skipped.`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "PDF extraction failed");
    if (/password/i.test(message)) {
      return { blocks: [], warnings: [], error: "This PDF is password-protected. Remove the password and try again." };
    }
    return { blocks: [], warnings: [], error: "This PDF couldn't be read. Make sure it's a valid, uncorrupted PDF file." };
  } finally {
    await parser.destroy().catch(() => {});
  }

  if (blocks.length === 0) {
    return {
      blocks: [],
      warnings,
      error: "No text could be extracted from this PDF. It appears to be scanned or image-only — try a text-based PDF instead.",
    };
  }
  return { blocks, warnings, error: null };
}

function extractMarkdown(text: string, parseHeadings: boolean): ExtractionResult {
  const blocks: DocBlock[] = [];
  const lines = text.split(/\r?\n/);
  let paragraph: string[] = [];
  let inFence = false;

  const flush = () => {
    if (paragraph.length > 0) {
      const joined = paragraph.join("\n").trim();
      if (joined) blocks.push({ kind: "paragraph", level: 0, text: joined });
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (parseHeadings && /^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      paragraph.push(line);
      continue;
    }
    if (!inFence && line.trim() === "") {
      flush();
      continue;
    }
    const headingMatch = parseHeadings && !inFence ? line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (headingMatch) {
      flush();
      blocks.push({ kind: "heading", level: headingMatch[1]!.length, text: headingMatch[2]!.trim() });
    } else {
      paragraph.push(line);
    }
  }
  flush();

  if (blocks.length === 0) {
    return { blocks: [], warnings: [], error: "The file is empty — there's no text to convert." };
  }
  return { blocks, warnings: [], error: null };
}

export async function extractDocument(filename: string, buffer: Buffer): Promise<ExtractionResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) return extractDocx(buffer);
  if (lower.endsWith(".pdf")) return extractPdf(buffer);
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return extractMarkdown(buffer.toString("utf-8"), true);
  }
  if (lower.endsWith(".txt")) {
    return extractMarkdown(buffer.toString("utf-8"), false);
  }
  return {
    blocks: [],
    warnings: [],
    error: "Unsupported document type. Please upload a .docx, .pdf, .txt or .md file.",
  };
}
