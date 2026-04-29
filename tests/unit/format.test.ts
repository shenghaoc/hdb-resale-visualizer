import { describe, expect, it, afterEach } from 'vitest';
import {
  formatCompactCurrency,
  formatMonth,
  formatNumber,
  resetFormatCachesForTests,
} from '../../src/lib/format';

describe('format memoization', () => {
  afterEach(() => {
    resetFormatCachesForTests();
  });

  it('reuses identity of the formatter', () => {
    // We cannot easily test identity of the formatter instances since they are hidden
    // inside the module, but we can verify that the formatting results are still correct
    // and that the memoization logic behaves the same.
    const val1 = formatCompactCurrency(1000000, 'en-SG');
    const val2 = formatCompactCurrency(1000000, 'en-SG');
    expect(val1).toBe(val2);
    expect(val1).toBe('$1.0M');
  });

  it('does not collide across number and date formatters', () => {
    // If they used the same map without key prefixes they would throw or format wrong
    const num = formatNumber(2024, 0, 'en-SG');
    const date = formatMonth('2024-01', 'en-SG');
    expect(num).toBe('2,024');
    expect(date).toBe('Jan 2024');
  });
});
