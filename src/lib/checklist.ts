import { z } from "zod";
import { CHECKLIST_STORAGE_KEY } from "@/lib/constants";

export const CHECKLIST_ITEMS = [
  "ethnicQuota",
  "remainingLease",
  "renovationCondition",
  "noise",
  "walkingRoute",
  "recentTransactions",
  "nearbyAmenities",
] as const;

export type ChecklistItemId = (typeof CHECKLIST_ITEMS)[number];

const checklistStateSchema = z.record(
  z.string(),
  z.array(z.string()).transform((arr) => {
    return arr.filter((item): item is ChecklistItemId =>
      CHECKLIST_ITEMS.includes(item as ChecklistItemId),
    );
  }),
).catch({});

export type ChecklistState = Record<string, ChecklistItemId[]>;

export function parseChecklistState(raw: unknown): ChecklistState {
  const parsed = checklistStateSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return {};
}

export function loadChecklistState(storage: Pick<Storage, "getItem">): ChecklistState {
  try {
    const value = storage.getItem(CHECKLIST_STORAGE_KEY);
    if (!value) return {};
    const parsed: unknown = JSON.parse(value);
    return parseChecklistState(parsed);
  } catch {
    return {};
  }
}

export function saveChecklistState(
  storage: Pick<Storage, "setItem">,
  state: ChecklistState,
) {
  try {
    storage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Ignore storage errors (e.g., quota exceeded)
    console.error("Failed to save checklist state", e);
  }
}

export function toggleChecklistItem(
  state: ChecklistState,
  addressKey: string,
  itemId: ChecklistItemId,
): ChecklistState {
  const addressItems = state[addressKey] ?? [];
  const hasItem = addressItems.includes(itemId);

  const newAddressItems = hasItem
    ? addressItems.filter((id) => id !== itemId)
    : [...addressItems, itemId];

  const newState = {
    ...state,
    [addressKey]: newAddressItems,
  };

  if (newAddressItems.length === 0) {
    delete newState[addressKey];
  }

  return newState;
}
