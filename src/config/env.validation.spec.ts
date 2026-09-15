import { resolveDatabaseUrl, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://localhost:5432/pubtrack',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
  };

  it('accepts a numeric PORT string and defaults when omitted', () => {
    expect(validateEnv({ ...base, PORT: '3000' }).PORT).toBe(3000);
    expect(validateEnv(base).PORT).toBe(3000);
  });

  it('rejects an invalid PORT', () => {
    expect(() => validateEnv({ ...base, PORT: 'nope' })).toThrow(
      /Invalid environment variables/,
    );
  });

  it('defaults JWT lifetimes', () => {
    const env = validateEnv(base);
    expect(env.JWT_ACCESS_EXPIRES_SECONDS).toBe(900);
    expect(env.JWT_REFRESH_EXPIRES_SECONDS).toBe(604800);
  });
});

describe('resolveDatabaseUrl', () => {
  const realUrl = 'postgresql://estiak@localhost:5432/pubtrack';
  const placeholder =
    'postgresql://johndoe:randompassword@localhost:5432/mydb?schema=public';

  it('keeps a real DATABASE_URL', () => {
    expect(resolveDatabaseUrl(realUrl, placeholder)).toBe(realUrl);
  });

  it('replaces the Prisma johndoe placeholder with the .env URL', () => {
    expect(resolveDatabaseUrl(placeholder, realUrl)).toBe(realUrl);
  });

  it('throws when only the Prisma placeholder is available', () => {
    expect(() => resolveDatabaseUrl(placeholder, placeholder)).toThrow(
      /johndoe/,
    );
  });
});
