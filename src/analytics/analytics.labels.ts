import {
  BookFormat,
  InventoryHolderType,
  MovementType,
} from '../../generated/prisma/client';
import type { OverviewActivityType } from './overview.types';

const FORMAT_LABELS: Record<BookFormat, string> = {
  HARDCOVER: 'Hardcover',
  PAPERBACK: 'Paperback',
  MASS_MARKET: 'Mass market',
  BOARD_BOOK: 'Board book',
  OTHER: 'Other',
};

export function formatEditionLabel(input: {
  format: BookFormat;
  title: string | null;
  publicationDate: Date | null;
}): string {
  const format = FORMAT_LABELS[input.format] ?? input.format;
  if (input.title) {
    return `${format} · ${input.title}`;
  }
  if (input.publicationDate) {
    return `${format} · ${input.publicationDate.getUTCFullYear()}`;
  }
  return format;
}

export function activityTypeFromMovement(
  type: MovementType,
): OverviewActivityType {
  switch (type) {
    case MovementType.SALE:
      return 'SALE';
    case MovementType.DISTRIBUTION:
      return 'DISTRIBUTION';
    case MovementType.RECEIPT:
      return 'RECEIPT';
    case MovementType.RETURN:
      return 'RETURN';
    case MovementType.PRINT_RECEIPT:
    case MovementType.ADJUSTMENT:
    case MovementType.LOSS:
    default:
      return 'ADJUSTMENT';
  }
}

export function activityTitleFromMovement(type: MovementType): string {
  switch (type) {
    case MovementType.SALE:
      return 'Sale confirmed';
    case MovementType.DISTRIBUTION:
      return 'Shipment dispatched';
    case MovementType.RECEIPT:
      return 'Stock received';
    case MovementType.RETURN:
      return 'Return recorded';
    case MovementType.PRINT_RECEIPT:
      return 'Print received';
    case MovementType.LOSS:
      return 'Loss recorded';
    case MovementType.ADJUSTMENT:
    default:
      return 'Warehouse adjustment';
  }
}

export function holderLabel(
  holderType: InventoryHolderType | null,
  holderId: string | null,
  librariesById: Map<string, string>,
): string | null {
  if (!holderType || !holderId) {
    return null;
  }
  if (holderType === InventoryHolderType.LIBRARY) {
    return librariesById.get(holderId) ?? 'Library';
  }
  return 'Warehouse';
}
