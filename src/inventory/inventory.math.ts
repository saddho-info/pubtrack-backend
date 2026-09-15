import { BadRequestException } from '@nestjs/common';
import { CopyStatus } from '../../generated/prisma/client';

export type InventoryCounts = {
  onHand: number;
  inTransit: number;
  sold: number;
  returned: number;
  lost: number;
};

export type InventoryDelta = Partial<InventoryCounts>;

export const EMPTY_INVENTORY_COUNTS: InventoryCounts = {
  onHand: 0,
  inTransit: 0,
  sold: 0,
  returned: 0,
  lost: 0,
};

export const COPY_TRANSITIONS: Record<CopyStatus, readonly CopyStatus[]> = {
  [CopyStatus.IN_STOCK_PUBLISHER]: [CopyStatus.DISTRIBUTED, CopyStatus.LOST],
  [CopyStatus.DISTRIBUTED]: [
    CopyStatus.IN_STOCK_LIBRARY,
    CopyStatus.IN_STOCK_PUBLISHER,
    CopyStatus.LOST,
  ],
  [CopyStatus.IN_STOCK_LIBRARY]: [
    CopyStatus.SOLD,
    CopyStatus.RETURNED,
    CopyStatus.LOST,
  ],
  [CopyStatus.SOLD]: [CopyStatus.RETURNED],
  [CopyStatus.RETURNED]: [
    CopyStatus.IN_STOCK_LIBRARY,
    CopyStatus.IN_STOCK_PUBLISHER,
  ],
  [CopyStatus.LOST]: [],
};

export function applyInventoryDelta(
  current: InventoryCounts,
  delta: InventoryDelta,
): InventoryCounts {
  return {
    onHand: current.onHand + (delta.onHand ?? 0),
    inTransit: current.inTransit + (delta.inTransit ?? 0),
    sold: current.sold + (delta.sold ?? 0),
    returned: current.returned + (delta.returned ?? 0),
    lost: current.lost + (delta.lost ?? 0),
  };
}

export function assertNonNegativeCounts(counts: InventoryCounts): void {
  if (
    counts.onHand < 0 ||
    counts.inTransit < 0 ||
    counts.sold < 0 ||
    counts.returned < 0 ||
    counts.lost < 0
  ) {
    throw new BadRequestException({
      message: 'Insufficient inventory',
      error: 'INSUFFICIENT_INVENTORY',
    });
  }
}

export function isLowStock(onHand: number, threshold: number): boolean {
  return onHand <= threshold;
}

export function assertCopyTransition(from: CopyStatus, to: CopyStatus): void {
  if (from === to) {
    return;
  }
  if (!COPY_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(
      `Cannot transition copy from ${from} to ${to}`,
    );
  }
}

export function sumInventoryRows(rows: InventoryCounts[]): InventoryCounts {
  return rows.reduce((acc, row) => applyInventoryDelta(acc, row), {
    ...EMPTY_INVENTORY_COUNTS,
  });
}
