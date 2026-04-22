import { useEffect, useState } from "react";
import {
  decodeShortlistFromUrl,
  loadShortlist,
  saveShortlist,
  toggleShortlistItem,
} from "@/lib/shortlist";
import type { ShortlistItem } from "@/types/data";

export function useShortlist() {
  const [items, setItems] = useState<ShortlistItem[]>([]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const shortlistParam = params.get("shortlist");
      if (shortlistParam) {
        const parsed = decodeShortlistFromUrl(shortlistParam);
        if (parsed.length > 0) {
          setItems(parsed);
          const newParams = new URLSearchParams(window.location.search);
          newParams.delete("shortlist");
          const newUrl = newParams.size ? `${window.location.pathname}?${newParams.toString()}` : window.location.pathname;
          window.history.replaceState({}, "", newUrl);
          return;
        }
      }
    } catch {
      // Ignore URL parsing errors
    }
    setItems(loadShortlist(window.localStorage));
  }, []);

  useEffect(() => {
    saveShortlist(window.localStorage, items);
  }, [items]);

  return {
    items,
    toggle(addressKey: string) {
      setItems((current) => toggleShortlistItem(current, addressKey));
    },
    update(addressKey: string, patch: Partial<ShortlistItem>) {
      setItems((current) =>
        current.map((item) =>
          item.addressKey === addressKey
            ? {
                ...item,
                ...patch,
              }
            : item,
        ),
      );
    },
    has(addressKey: string) {
      return items.some((item) => item.addressKey === addressKey);
    },
  };
}
