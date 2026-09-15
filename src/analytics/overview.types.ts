export const OVERVIEW_PERIODS = ['7d', '30d', '90d', 'all'] as const;

export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

export type OverviewActivityType =
  'SALE' | 'DISTRIBUTION' | 'RECEIPT' | 'ADJUSTMENT' | 'RETURN';

export type OverviewKpis = {
  totalInventory: number;
  distributed: number;
  sold: number;
  warehouse: number;
  lowStockCount: number;
};

export type OverviewLibraryRank = {
  libraryId: string;
  name: string;
  sold: number;
};

export type OverviewLowStockItem = {
  editionId: string;
  bookTitle: string;
  editionLabel: string;
  onHand: number;
  threshold: number;
};

export type OverviewTopBook = {
  editionId: string;
  bookTitle: string;
  editionLabel: string;
  sold: number;
};

export type OverviewActivityItem = {
  id: string;
  type: OverviewActivityType;
  title: string;
  detail: string;
  occurredAt: string;
};

export type OverviewSnapshot = {
  publisherId: string | null;
  source: 'stub' | 'live';
  generatedAt: string;
  period: {
    key: OverviewPeriod;
    from: string | null;
    to: string;
  };
  kpis: OverviewKpis;
  libraries: OverviewLibraryRank[];
  lowStock: OverviewLowStockItem[];
  topBooks: OverviewTopBook[];
  activity: OverviewActivityItem[];
};

export function isOverviewPeriod(value: unknown): value is OverviewPeriod {
  return (
    typeof value === 'string' &&
    (OVERVIEW_PERIODS as readonly string[]).includes(value)
  );
}

export function periodRange(
  period: OverviewPeriod,
  now = new Date(),
): { from: string | null; to: string } {
  const to = now.toISOString();
  if (period === 'all') {
    return { from: null, to };
  }

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to };
}

/** Zero snapshot helper for fixtures/tests. Live aggregations use `source: "live"`. */
export function emptyOverviewSnapshot(input: {
  publisherId: string | null;
  period: OverviewPeriod;
  now?: Date;
  source?: OverviewSnapshot['source'];
}): OverviewSnapshot {
  const now = input.now ?? new Date();
  return {
    publisherId: input.publisherId,
    source: input.source ?? 'live',
    generatedAt: now.toISOString(),
    period: {
      key: input.period,
      ...periodRange(input.period, now),
    },
    kpis: {
      totalInventory: 0,
      distributed: 0,
      sold: 0,
      warehouse: 0,
      lowStockCount: 0,
    },
    libraries: [],
    lowStock: [],
    topBooks: [],
    activity: [],
  };
}
