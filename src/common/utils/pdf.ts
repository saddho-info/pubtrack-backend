/**
 * Minimal single-page-capable text PDF writer (no external deps).
 * Suitable for MVP tabular exports streamed in one response.
 */

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function toSimplePdf(title: string, lines: string[]): Buffer {
  const contentLines = [
    'BT',
    '/F1 14 Tf',
    '50 780 Td',
    `(${escapePdfText(title)}) Tj`,
    '0 -24 Td',
    '/F1 9 Tf',
  ];

  const maxLines = 70;
  const truncated = lines.slice(0, maxLines);
  for (const line of truncated) {
    contentLines.push(`(${escapePdfText(line.slice(0, 110))}) Tj`);
    contentLines.push('0 -12 Td');
  }
  if (lines.length > maxLines) {
    contentLines.push(`(… truncated ${lines.length - maxLines} more lines) Tj`);
  }
  contentLines.push('ET');

  const stream = contentLines.join('\n');
  const objects: string[] = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n',
  );
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream\nendobj\n`,
  );
  objects.push(
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n',
  );

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

export function rowsToPdfLines(
  headers: string[],
  rows: Array<Array<unknown>>,
): string[] {
  const headerLine = headers.join(' | ');
  const body = rows.map((row) =>
    row
      .map((cell) => {
        if (cell === null || cell === undefined) return '';
        if (cell instanceof Date) return cell.toISOString();
        return String(cell);
      })
      .join(' | '),
  );
  return [headerLine, '-'.repeat(Math.min(headerLine.length, 100)), ...body];
}
