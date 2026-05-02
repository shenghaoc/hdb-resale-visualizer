import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeStorage } from '@/lib/storage';

describe('safeStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getItem', () => {
    it('should return value when localStorage is working', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('test-value');
      expect(safeStorage.getItem('test-key')).toBe('test-value');
    });

    it('should return null when localStorage throws an error', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Access denied');
      });
      expect(safeStorage.getItem('test-key')).toBeNull();
    });
  });

  describe('setItem', () => {
    it('should call localStorage.setItem when working', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
      safeStorage.setItem('test-key', 'test-value');
      expect(setItemSpy).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should gracefully handle errors when localStorage.setItem throws', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Quota exceeded');
      });
      // Should not throw
      expect(() => safeStorage.setItem('test-key', 'test-value')).not.toThrow();
      expect(setItemSpy).toHaveBeenCalledWith('test-key', 'test-value');
    });
  });

  describe('removeItem', () => {
    it('should call localStorage.removeItem when working', () => {
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {});
      safeStorage.removeItem('test-key');
      expect(removeItemSpy).toHaveBeenCalledWith('test-key');
    });

    it('should gracefully handle errors when localStorage.removeItem throws', () => {
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Access denied');
      });
      // Should not throw
      expect(() => safeStorage.removeItem('test-key')).not.toThrow();
      expect(removeItemSpy).toHaveBeenCalledWith('test-key');
    });
  });
});
