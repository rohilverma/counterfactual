import { describe, it, expect } from 'vitest';
import { downsample } from './calculations';
import type { PortfolioDataPoint } from '../types/PortfolioDataPoint';

function makePoint(date: string): PortfolioDataPoint {
  return {
    date,
    portfolioValue: 100,
    counterfactualValue: 100,
    totalDeposits: 100,
    portfolioReturn: 0,
    counterfactualReturn: 0,
  };
}

/** Generate N daily points starting from a date (skipping weekends). */
function makeDailyPoints(n: number, startDate = '2020-01-02'): PortfolioDataPoint[] {
  const points: PortfolioDataPoint[] = [];
  const d = new Date(startDate + 'T00:00:00');
  while (points.length < n) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      points.push(makePoint(`${yyyy}-${mm}-${dd}`));
    }
    d.setDate(d.getDate() + 1);
  }
  return points;
}

describe('downsample', () => {
  it('returns points unchanged when under maxPoints', () => {
    const points = makeDailyPoints(100);
    const result = downsample(points, 500);
    expect(result).toBe(points); // same reference
  });

  it('returns points unchanged when exactly at maxPoints', () => {
    const points = makeDailyPoints(500);
    const result = downsample(points, 500);
    expect(result).toBe(points);
  });

  it('downsamples to weekly for ~2 years of daily data (~500 points)', () => {
    const points = makeDailyPoints(600);
    const result = downsample(points, 500);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.length).toBeGreaterThan(50);
  });

  it('downsamples 5 years of daily data (~1250 points) to under 500', () => {
    const points = makeDailyPoints(1250);
    const result = downsample(points, 500);
    expect(result.length).toBeLessThanOrEqual(500);
    // Weekly should give ~250 points for 5 years
    expect(result.length).toBeGreaterThan(100);
  });

  it('downsamples 20 years of daily data to under 500', () => {
    const points = makeDailyPoints(5000);
    const result = downsample(points, 500);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.length).toBeGreaterThan(50);
  });

  it('always includes the first point', () => {
    const points = makeDailyPoints(1000);
    const result = downsample(points, 500);
    expect(result[0]).toBe(points[0]);
  });

  it('always includes the last point', () => {
    const points = makeDailyPoints(1000);
    const result = downsample(points, 500);
    expect(result[result.length - 1]).toBe(points[points.length - 1]);
  });

  it('uses larger intervals for very large datasets', () => {
    const small = makeDailyPoints(600);
    const large = makeDailyPoints(5000);
    const smallResult = downsample(small, 500);
    const largeResult = downsample(large, 500);
    // Larger dataset should produce fewer or comparable points despite more input
    expect(largeResult.length).toBeLessThanOrEqual(500);
    // The large dataset needs a bigger interval, so its points should be more spread out
    const smallSpanDays =
      (new Date(smallResult[smallResult.length - 1].date).getTime() -
        new Date(smallResult[0].date).getTime()) /
      86400000;
    const largeSpanDays =
      (new Date(largeResult[largeResult.length - 1].date).getTime() -
        new Date(largeResult[0].date).getTime()) /
      86400000;
    const smallAvgGap = smallSpanDays / (smallResult.length - 1);
    const largeAvgGap = largeSpanDays / (largeResult.length - 1);
    expect(largeAvgGap).toBeGreaterThan(smallAvgGap);
  });

  it('handles empty array', () => {
    const result = downsample([], 500);
    expect(result).toEqual([]);
  });

  it('handles single point', () => {
    const points = [makePoint('2024-01-02')];
    const result = downsample(points, 500);
    expect(result).toBe(points);
  });
});
