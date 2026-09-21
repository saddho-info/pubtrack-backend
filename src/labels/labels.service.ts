import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { CopyStatus } from '../../generated/prisma/client';
import {
  CopiesService,
  type LabelCopy,
} from '../copies/copies.service';
import { QrService } from '../copies/qr.service';
import type { AuthUser } from '../common/types/auth-user';
import { LabelQueryDto } from './dto/label-query.dto';

const MM = 72 / 25.4;
const A4 = { width: 210 * MM, height: 297 * MM };
const THERMAL = { width: 50 * MM, height: 25 * MM };

@Injectable()
export class LabelsService {
  constructor(
    private readonly copies: CopiesService,
    private readonly qr: QrService,
  ) {}

  async generate(
    editionId: string,
    query: LabelQueryDto,
    user: AuthUser,
  ): Promise<Buffer> {
    const copies = await this.copies.findAllForLabels(
      editionId,
      {
        status:
          query.status === 'all'
            ? undefined
            : (query.status ?? CopyStatus.IN_STOCK_PUBLISHER),
        limit: query.limit,
        offset: query.offset,
      },
      user,
    );

    if (copies.length === 0) {
      throw new NotFoundException('No copies match the requested label filters');
    }

    const qrImages = await Promise.all(
      copies.map((copy) => this.qr.toBuffer(copy.qrToken)),
    );

    return query.format === 'thermal'
      ? this.thermalPdf(copies, qrImages)
      : this.a4Pdf(copies, qrImages);
  }

  private a4Pdf(copies: LabelCopy[], qrImages: Buffer[]): Promise<Buffer> {
    const document = new PDFDocument({
      autoFirstPage: false,
      size: [A4.width, A4.height],
      margin: 0,
      info: { Title: 'PubTrack QR labels' },
    });
    const output = this.collect(document);
    const margin = 5 * MM;
    const gap = 2 * MM;
    const labelWidth = (A4.width - margin * 2 - gap * 2) / 3;
    const labelHeight = (A4.height - margin * 2 - gap * 7) / 8;
    const qrSize = 20 * MM;

    copies.forEach((copy, index) => {
      if (index % 24 === 0) {
        document.addPage();
      }
      const pageIndex = index % 24;
      const column = pageIndex % 3;
      const row = Math.floor(pageIndex / 3);
      const x = margin + column * (labelWidth + gap);
      const y = margin + row * (labelHeight + gap);
      const padding = 2 * MM;

      document
        .lineWidth(0.35)
        .strokeColor('#cbd5e1')
        .rect(x, y, labelWidth, labelHeight)
        .stroke();
      document.image(qrImages[index], x + padding, y + padding, {
        width: qrSize,
        height: qrSize,
      });

      const textX = x + padding + qrSize + 2 * MM;
      const textWidth = labelWidth - (textX - x) - padding;
      document
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(copy.title, textX, y + padding, {
          width: textWidth,
          height: 9 * MM,
          ellipsis: true,
        });
      document
        .font('Helvetica')
        .fontSize(6.5)
        .text(`ISBN ${copy.isbn}`, textX, y + 13 * MM, {
          width: textWidth,
          ellipsis: true,
        })
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(`Copy #${copy.copyNumber}`, textX, y + 18 * MM, {
          width: textWidth,
        });
    });

    document.end();
    return output;
  }

  private thermalPdf(copies: LabelCopy[], qrImages: Buffer[]): Promise<Buffer> {
    const document = new PDFDocument({
      autoFirstPage: false,
      size: [THERMAL.width, THERMAL.height],
      margin: 0,
      info: { Title: 'PubTrack thermal QR labels' },
    });
    const output = this.collect(document);
    const padding = 2 * MM;
    const qrSize = 18 * MM;

    copies.forEach((copy, index) => {
      document.addPage();
      document.image(qrImages[index], padding, 3.5 * MM, {
        width: qrSize,
        height: qrSize,
      });

      const textX = padding + qrSize + 2 * MM;
      const textWidth = THERMAL.width - textX - padding;
      document
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(copy.title, textX, 3.5 * MM, {
          width: textWidth,
          height: 8 * MM,
          ellipsis: true,
        })
        .font('Helvetica')
        .fontSize(6)
        .text(`ISBN ${copy.isbn}`, textX, 13 * MM, {
          width: textWidth,
          ellipsis: true,
        })
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(`Copy #${copy.copyNumber}`, textX, 18 * MM, {
          width: textWidth,
        });
    });

    document.end();
    return output;
  }

  private collect(document: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
  }
}
