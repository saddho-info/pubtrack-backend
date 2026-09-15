import {
  BookFormat,
  InventoryHolderType,
  MovementType,
} from '../../generated/prisma/client';
import {
  activityTitleFromMovement,
  activityTypeFromMovement,
  formatEditionLabel,
  holderLabel,
} from './analytics.labels';

describe('analytics.labels', () => {
  it('formats edition labels with title or year', () => {
    expect(
      formatEditionLabel({
        format: BookFormat.HARDCOVER,
        title: 'Deluxe',
        publicationDate: new Date('2026-01-01'),
      }),
    ).toBe('Hardcover · Deluxe');

    expect(
      formatEditionLabel({
        format: BookFormat.PAPERBACK,
        title: null,
        publicationDate: new Date('2025-06-01'),
      }),
    ).toBe('Paperback · 2025');

    expect(
      formatEditionLabel({
        format: BookFormat.OTHER,
        title: null,
        publicationDate: null,
      }),
    ).toBe('Other');
  });

  it('maps movement types to activity metadata', () => {
    expect(activityTypeFromMovement(MovementType.SALE)).toBe('SALE');
    expect(activityTypeFromMovement(MovementType.PRINT_RECEIPT)).toBe(
      'ADJUSTMENT',
    );
    expect(activityTitleFromMovement(MovementType.DISTRIBUTION)).toBe(
      'Shipment dispatched',
    );
  });

  it('resolves holder labels', () => {
    const libraries = new Map([['lib_1', 'Riverside']]);
    expect(holderLabel(InventoryHolderType.LIBRARY, 'lib_1', libraries)).toBe(
      'Riverside',
    );
    expect(holderLabel(InventoryHolderType.PUBLISHER, 'pub_1', libraries)).toBe(
      'Warehouse',
    );
    expect(holderLabel(null, null, libraries)).toBeNull();
  });
});
