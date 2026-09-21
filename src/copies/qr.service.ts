import { Injectable } from '@nestjs/common';
import QRCode from 'qrcode';
import { generateQrToken } from '../common/utils/qr-token';

@Injectable()
export class QrService {
  createToken(): string {
    return generateQrToken();
  }

  async toDataUrl(token: string): Promise<string> {
    return QRCode.toDataURL(token, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  }

  async toBuffer(token: string): Promise<Buffer> {
    return QRCode.toBuffer(token, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  }
}
