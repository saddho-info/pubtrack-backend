export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug;
}

export function slugifyOrFallback(
  input: string,
  fallbackPrefix: string,
): string {
  const slug = slugify(input);
  if (slug.length > 0) {
    return slug;
  }

  return `${fallbackPrefix}-${Date.now().toString(36)}`;
}
