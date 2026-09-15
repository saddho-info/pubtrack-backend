import { hashRefreshToken, verifyRefreshToken } from './password';

describe('refresh token hashing', () => {
  it('distinguishes JWTs that share a long common prefix', () => {
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.';
    const shared = 'a'.repeat(80);
    const first = `${header}${shared}token-one`;
    const second = `${header}${shared}token-two`;

    const hash = hashRefreshToken(first);
    expect(verifyRefreshToken(first, hash)).toBe(true);
    expect(verifyRefreshToken(second, hash)).toBe(false);
  });
});
