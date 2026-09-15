import { slugify, slugifyOrFallback } from './slugify';

describe('slugify', () => {
  it('normalizes names into url-safe slugs', () => {
    expect(slugify('Northwind Press')).toBe('northwind-press');
    expect(slugify('  Riverside — Public Library  ')).toBe(
      'riverside-public-library',
    );
  });

  it('falls back when the name has no alphanumeric characters', () => {
    const slug = slugifyOrFallback('!!!', 'publisher');
    expect(slug.startsWith('publisher-')).toBe(true);
  });
});
