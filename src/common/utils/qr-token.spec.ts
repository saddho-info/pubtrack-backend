import { generateQrToken } from './qr-token';

describe('generateQrToken', () => {
  it('returns a URL-safe opaque token', () => {
    const token = generateQrToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it('does not collide across many draws', () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => generateQrToken()),
    );
    expect(tokens.size).toBe(200);
  });
});
