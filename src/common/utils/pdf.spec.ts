import { rowsToPdfLines, toSimplePdf } from './pdf';

describe('pdf utils', () => {
  it('builds a valid PDF header', () => {
    const pdf = toSimplePdf('Title', rowsToPdfLines(['a', 'b'], [[1, 2]]));
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.toString('utf8')).toContain('%%EOF');
  });
});
