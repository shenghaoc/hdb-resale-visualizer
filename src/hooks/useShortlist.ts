import { useEffect, useState } from "react";
import { loadShortlist, saveShortlist, toggleShortlistItem } from "@/lib/shortlist";
import type { ShortlistItem } from "@/types/data";

export function useShortlist() {
  const [items, setItems] = useState<ShortlistItem[]>([]);

  useEffect(() => {
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
