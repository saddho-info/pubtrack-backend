import { Role } from '../../generated/prisma/client';
import type { AuthUser } from '../common/types/auth-user';
import type { CopiesService, LabelCopy } from '../copies/copies.service';
import { QrService } from '../copies/qr.service';
import type { LabelQueryDto } from './dto/label-query.dto';
import { LabelsService } from './labels.service';

const user: AuthUser = {
  sub: 'user-1',
  id: 'user-1',
  email: 'publisher@example.com',
  role: Role.PUBLISHER_ADMIN,
  publisherId: 'publisher-1',
  libraryId: null,
};

function labelCopies(count: number): LabelCopy[] {
  return Array.from({ length: count }, (_, index) => ({
    copyNumber: index + 1,
    qrToken: `opaque-token-${index + 1}`,
    isbn: '9780123456786',
    title: 'A Book With a Useful Title',
  }));
}

describe('LabelsService', () => {
  const findAllForLabels = jest.fn();
  const toBuffer = jest.fn();
  const copies = { findAllForLabels } as unknown as CopiesService;
  const qr = { toBuffer } as unknown as QrService;
  const service = new LabelsService(copies, qr);

  beforeAll(async () => {
    const png = await new QrService().toBuffer('test-token');
    toBuffer.mockResolvedValue(png);
  });

  beforeEach(() => {
    findAllForLabels.mockReset();
  });

  it('generates a valid two-page A4 PDF for 25 labels', async () => {
    findAllForLabels.mockResolvedValue(labelCopies(25));

    const pdf = await service.generate(
      'edition-1',
      {
        format: 'a4',
        status: 'IN_STOCK_PUBLISHER',
        limit: 100,
        offset: 0,
      } as LabelQueryDto,
      user,
    );

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  });

  it('uses one 50x25mm page per thermal label', async () => {
    findAllForLabels.mockResolvedValue(labelCopies(2));

    const pdf = await service.generate(
      'edition-1',
      {
        format: 'thermal',
        status: 'all',
        limit: 100,
        offset: 0,
      } as LabelQueryDto,
      user,
    );

    const source = pdf.toString('latin1');
    expect(source.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
    expect(source).toMatch(/\/MediaBox \[0 0 141\.732\d* 70\.866\d*\]/);
    expect(findAllForLabels).toHaveBeenCalledWith(
      'edition-1',
      { status: undefined, limit: 100, offset: 0 },
      user,
    );
  });

  it('rejects an export with no matching copies', async () => {
    findAllForLabels.mockResolvedValue([]);

    await expect(
      service.generate(
        'edition-1',
        {
          format: 'a4',
          status: 'IN_STOCK_PUBLISHER',
          limit: 100,
          offset: 0,
        } as LabelQueryDto,
        user,
      ),
    ).rejects.toThrow('No copies match');
  });
});
