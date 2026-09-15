import {
  emptyOverviewSnapshot,
  isOverviewPeriod,
  periodRange,
} from './overview.types';

describe('overview.types', () => {
  const now = new Date('2026-08-13T12:00:00.000Z');

  it('accepts known period keys', () => {
    expect(isOverviewPeriod('7d')).toBe(true);
    expect(isOverviewPeriod('30d')).toBe(true);
    expect(isOverviewPeriod('90d')).toBe(true);
    expect(isOverviewPeriod('all')).toBe(true);
    expect(isOverviewPeriod('1y')).toBe(false);
  });

  it('computes rolling windows from now', () => {
    expect(periodRange('7d', now)).toEqual({
      from: '2026-08-06T12:00:00.000Z',
      to: '2026-08-13T12:00:00.000Z',
    });
    expect(periodRange('all', now).from).toBeNull();
  });

  it('builds an empty live snapshot', () => {
    const snapshot = emptyOverviewSnapshot({
      publisherId: 'pub_1',
      period: '90d',
      now,
    });
    expect(snapshot.source).toBe('live');
    expect(snapshot.period.key).toBe('90d');
    expect(snapshot.kpis.sold).toBe(0);
  });
});
