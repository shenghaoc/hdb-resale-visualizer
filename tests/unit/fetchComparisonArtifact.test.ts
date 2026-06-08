import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DATA_FETCH_USER_ERROR_MESSAGE,
  fetchComparisonArtifact,
  resetFetchRetrySettingsForTests,
  setFetchRetryDelayForTests,
} from '@/shared/lib/data';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchComparisonArtifact', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    resetFetchRetrySettingsForTests();
    vi.restoreAllMocks();
  });

  it('should fetch comparison artifact successfully', async () => {
    const mockArtifact = {
      addressKey: 'test-address',
      town: 'Test Town',
      flatType: '3 ROOM',
      amenities: {
        primarySchoolsWithin1km: 2,
        primarySchoolsWithin2km: 5,
        nearestPrimarySchoolMeters: 300,
        nearestPrimarySchools: [
          {
            name: 'TEST PRIMARY SCHOOL',
            distanceMeters: 300,
          },
        ],
        hawkerCentresWithin1km: 1,
        nearestHawkerCentreMeters: 500,
        supermarketsWithin1km: 3,
        nearestSupermarketMeters: 200,
        parksWithin1km: 2,
        nearestParkMeters: 150,
      },
      percentileRanks: {
        pricePercentile: 75,
        pricePerSqmPercentile: 80,
        leasePercentile: 60,
        mrtDistancePercentile: 45,
        transactionCountPercentile: 90,
        recencyPercentile: 85,
      },
      generatedAt: '2024-01-01T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockArtifact),
    });

    const result = await fetchComparisonArtifact('test-address');
    
    expect(mockFetch).toHaveBeenCalledWith('/api/comparisons/test-address');
    expect(result).toEqual(mockArtifact);
  });

  it('should return null when comparison data does not exist (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await fetchComparisonArtifact('nonexistent-address');
    
    expect(result).toBeNull();
  });

  it('retries transient HTTP errors then surfaces a user-visible error', async () => {
    setFetchRetryDelayForTests(0);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(fetchComparisonArtifact('test-address')).rejects.toMatchObject({
      name: 'DataFetchError',
      userMessage: DATA_FETCH_USER_ERROR_MESSAGE,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry unknown/unclassified errors', async () => {
    // A plain Error (not a TypeError) is treated as non-transient.
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchComparisonArtifact('test-address')).rejects.toThrow('Network error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries TypeError network failures then surfaces a user-visible error', async () => {
    // Browsers surface real network failures (DNS, connection refused) as
    // `TypeError: Failed to fetch`, which the data layer treats as transient.
    setFetchRetryDelayForTests(0);
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchComparisonArtifact('test-address')).rejects.toMatchObject({
      name: 'DataFetchError',
      userMessage: DATA_FETCH_USER_ERROR_MESSAGE,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should not treat schema violations as missing artifact when address key contains 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ addressKey: 'block-404' }),
    });

    await expect(fetchComparisonArtifact('block-404')).rejects.toThrow(
      /Artifact contract violation/
    );
  });
});
