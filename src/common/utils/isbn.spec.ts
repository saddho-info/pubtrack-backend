import {
  formatIsbn10,
  formatIsbn13,
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
} from './isbn';

describe('isbn', () => {
  it('strips hyphens and spaces', () => {
    expect(normalizeIsbn('978-0-306-40615-7')).toBe('9780306406157');
    expect(normalizeIsbn('0-306-40615-2')).toBe('0306406152');
  });

  it('accepts well-known ISBN-13 values', () => {
    expect(isValidIsbn13('9780306406157')).toBe(true);
    expect(isValidIsbn13('9783161484100')).toBe(true);
    expect(isValidIsbn13('9781402894626')).toBe(true);
  });

  it('rejects ISBN-13 values with a bad check digit or length', () => {
    expect(isValidIsbn13('9780306406158')).toBe(false);
    expect(isValidIsbn13('978030640615')).toBe(false);
    expect(isValidIsbn13('97803064061570')).toBe(false);
  });

  it('validates ISBN-10 including X check digits', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn10('043942089X')).toBe(true);
    expect(isValidIsbn10('0306406153')).toBe(false);
  });

  it('formats compact display hyphens', () => {
    expect(formatIsbn13('9780306406157')).toBe('978-030640615-7');
    expect(formatIsbn10('0306406152')).toBe('0-30640-615-2');
  });
});
