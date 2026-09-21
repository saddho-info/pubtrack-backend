import { QrService } from './qr.service';

describe('QrService', () => {
  const service = new QrService();

  it('creates an opaque URL-safe token', () => {
    const token = service.createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toMatch(/copy|isbn|edition/i);
  });

  it('renders a PNG data URL for a token', async () => {
    const dataUrl = await service.toDataUrl('opaque-token-example');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(100);
  });

  it('renders a PNG buffer for a token', async () => {
    const buffer = await service.toBuffer('opaque-token-example');
    expect(buffer.subarray(1, 4).toString()).toBe('PNG');
    expect(buffer.length).toBeGreaterThan(100);
  });
});
