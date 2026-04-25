import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchComparisonArtifact } from '@/lib/data';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchComparisonArtifact', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
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
    
    expect(mockFetch).toHaveBeenCalledWith('/data/comparisons/test-address.json');
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

  it('should throw error for other HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(fetchComparisonArtifact('test-address')).rejects.toThrow(
      'Failed to load /data/comparisons/test-address.json: 500'
    );
  });

  it('should throw error for network failures', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchComparisonArtifact('test-address')).rejects.toThrow('Network error');
  });
});
