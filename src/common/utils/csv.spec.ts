import { csvEscape, toCsv } from './csv';

describe('csv utils', () => {
  it('escapes commas quotes and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
  });

  it('serializes a header + rows document', () => {
    const csv = toCsv(['code', 'total'], [['S-1', 12.5], ['S-2', null]]);
    expect(csv).toBe('code,total\r\nS-1,12.5\r\nS-2,\r\n');
  });
});
