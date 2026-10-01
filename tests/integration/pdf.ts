// Minimal text-only PDF writer for synthetic test CVs (fake people only).
export function makePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const perPage = 48;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (pages.length === 0) pages.push(['']);

  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 font, then per page: page object + content stream
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let next = 4;
  for (const page of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    const stream = `BT /F1 10 Tf 40 800 Td 14 TL ${page.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export const CV_BODY = [
  'PROFESSIONAL SUMMARY',
  'Product manager with six years of experience building logistics software for freight forwarders.',
  'Led the shipment tracking roadmap, ran customer discovery with operations teams and shipped three',
  'features that customers adopted without being asked.',
  'EXPERIENCE',
  'Acme Freight Tech  2019 - 2024',
  'Noticed that carrier updates were being copied by hand into spreadsheets, built an automated tracker',
  'on my own initiative, and the whole operations team still uses it today.',
  'Owned the pricing launch alone with no senior sign-off; when it failed I wrote a post-mortem and',
  'turned it into a launch checklist that is now standard practice for the team.',
  'EDUCATION',
  'Delhi University  2015 - 2018',
];
