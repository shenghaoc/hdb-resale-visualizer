import { describe, it, expect, vi, afterEach } from "vitest";
import { safeStorage } from "../../src/lib/storage";

const originalLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");

function installLocalStorageMock(
  overrides: Partial<Pick<Storage, "getItem" | "setItem" | "removeItem">> = {},
) {
  const storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    ...overrides,
  } as Pick<Storage, "getItem" | "setItem" | "removeItem">;

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });

  return storage;
}

describe("safeStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLocalStorage) {
      Object.defineProperty(window, "localStorage", originalLocalStorage);
    } else {
      Reflect.deleteProperty(window, "localStorage");
    }
  });

  describe("getItem", () => {
    it("should return value when localStorage is working", () => {
      installLocalStorageMock({
        getItem: vi.fn(() => "test-value"),
      });

      expect(safeStorage.getItem("test-key")).toBe("test-value");
    });

    it("should return null when localStorage throws an error", () => {
      installLocalStorageMock({
        getItem: vi.fn(() => {
          throw new Error("Access denied");
        }),
      });

      expect(safeStorage.getItem("test-key")).toBeNull();
    });
  });

  describe("setItem", () => {
    it("should call localStorage.setItem when working", () => {
      const setItemSpy = vi.fn();
      installLocalStorageMock({
        setItem: setItemSpy,
      });

      safeStorage.setItem("test-key", "test-value");
      expect(setItemSpy).toHaveBeenCalledWith("test-key", "test-value");
    });

    it("should gracefully handle errors when localStorage.setItem throws", () => {
      const setItemSpy = vi.fn(() => {
        throw new Error("Quota exceeded");
      });
      installLocalStorageMock({
        setItem: setItemSpy,
      });

      expect(() => safeStorage.setItem("test-key", "test-value")).not.toThrow();
      expect(setItemSpy).toHaveBeenCalledWith("test-key", "test-value");
    });
  });

  describe("removeItem", () => {
    it("should call localStorage.removeItem when working", () => {
      const removeItemSpy = vi.fn();
      installLocalStorageMock({
        removeItem: removeItemSpy,
      });

      safeStorage.removeItem("test-key");
      expect(removeItemSpy).toHaveBeenCalledWith("test-key");
    });

    it("should gracefully handle errors when localStorage.removeItem throws", () => {
      const removeItemSpy = vi.fn(() => {
        throw new Error("Access denied");
      });
      installLocalStorageMock({
        removeItem: removeItemSpy,
      });

      expect(() => safeStorage.removeItem("test-key")).not.toThrow();
      expect(removeItemSpy).toHaveBeenCalledWith("test-key");
    });
  });
});
