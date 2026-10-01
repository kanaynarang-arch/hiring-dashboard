import { PDFParse } from 'pdf-parse';

export interface ExtractedPdf {
  text: string;
  pages: number;
  title: string;
  author: string;
}

// Postgres text cannot hold NUL, and PDF extraction can emit control characters
// and lone surrogates. They carry no content, so they are dropped.
export function sanitizeExtractedText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

export async function extractPdf(data: Buffer | Uint8Array): Promise<ExtractedPdf> {
  const parser = new PDFParse({ data });
  try {
    const textResult = await parser.getText();
    let title = '';
    let author = '';
    try {
      const info = await parser.getInfo();
      title = sanitizeExtractedText(String(info.info?.Title ?? ''));
      author = sanitizeExtractedText(String(info.info?.Author ?? ''));
    } catch {
      // Metadata is only a corroborating signal; absence is fine.
    }
    return { text: sanitizeExtractedText(textResult.text), pages: textResult.total ?? 0, title, author };
  } finally {
    await parser.destroy();
  }
}
