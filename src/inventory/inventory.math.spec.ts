import { BadRequestException } from '@nestjs/common';
import { CopyStatus } from '../../generated/prisma/client';
import {
  applyInventoryDelta,
  assertCopyTransition,
  assertNonNegativeCounts,
  EMPTY_INVENTORY_COUNTS,
  isLowStock,
  sumInventoryRows,
} from './inventory.math';

describe('inventory.math', () => {
  it('applies print-receipt deltas onto empty warehouse counts', () => {
    expect(applyInventoryDelta(EMPTY_INVENTORY_COUNTS, { onHand: 12 })).toEqual(
      {
        onHand: 12,
        inTransit: 0,
        sold: 0,
        returned: 0,
        lost: 0,
      },
    );
  });

  it('applies a sale as on-hand decrement and sold increment', () => {
    expect(
      applyInventoryDelta(
        { onHand: 4, inTransit: 0, sold: 1, returned: 0, lost: 0 },
        { onHand: -1, sold: 1 },
      ),
    ).toEqual({
      onHand: 3,
      inTransit: 0,
      sold: 2,
      returned: 0,
      lost: 0,
    });
  });

  it('rejects negative aggregate counts', () => {
    expect(() =>
      assertNonNegativeCounts({
        onHand: -1,
        inTransit: 0,
        sold: 0,
        returned: 0,
        lost: 0,
      }),
    ).toThrow(BadRequestException);
  });

  it('flags low stock at or below the threshold', () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(4, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
  });

  it('allows the documented copy status transitions and blocks the rest', () => {
    expect(() =>
      assertCopyTransition(
        CopyStatus.IN_STOCK_PUBLISHER,
        CopyStatus.DISTRIBUTED,
      ),
    ).not.toThrow();
    expect(() =>
      assertCopyTransition(CopyStatus.IN_STOCK_LIBRARY, CopyStatus.SOLD),
    ).not.toThrow();
    expect(() =>
      assertCopyTransition(CopyStatus.SOLD, CopyStatus.IN_STOCK_LIBRARY),
    ).toThrow(BadRequestException);
    expect(() =>
      assertCopyTransition(CopyStatus.LOST, CopyStatus.IN_STOCK_PUBLISHER),
    ).toThrow(BadRequestException);
  });

  it('sums holder rows into a single edition rollup', () => {
    expect(
      sumInventoryRows([
        { onHand: 10, inTransit: 2, sold: 1, returned: 0, lost: 0 },
        { onHand: 3, inTransit: 0, sold: 4, returned: 1, lost: 0 },
      ]),
    ).toEqual({
      onHand: 13,
      inTransit: 2,
      sold: 5,
      returned: 1,
      lost: 0,
    });
  });
});
