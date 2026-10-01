import { PDFParse } from 'pdf-parse';

export interface ExtractedPdf {
  text: string;
  pages: number;
  title: string;
  author: string;
}

export async function extractPdf(data: Buffer | Uint8Array): Promise<ExtractedPdf> {
  const parser = new PDFParse({ data });
  try {
    const textResult = await parser.getText();
    let title = '';
    let author = '';
    try {
      const info = await parser.getInfo();
      title = String(info.info?.Title ?? '');
      author = String(info.info?.Author ?? '');
    } catch {
      // Metadata is only a corroborating signal; absence is fine.
    }
    return { text: textResult.text, pages: textResult.total ?? 0, title, author };
  } finally {
    await parser.destroy();
  }
}
