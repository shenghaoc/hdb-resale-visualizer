import { z } from "zod";
import { CHECKLIST_STORAGE_KEY } from "../../shared/lib/constants";

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
export type ChecklistState = Record<string, ChecklistItemId[]>;

const checklistStateSchema = z
  .record(
    z.string(),
    z
      .array(z.string())
      .catch([])
      .transform((arr) => {
        return arr.filter((item): item is ChecklistItemId =>
          CHECKLIST_ITEMS.includes(item as ChecklistItemId),
        );
      }),
  )
  .transform((state): ChecklistState => {
    return Object.fromEntries(Object.entries(state).filter(([, items]) => items.length > 0));
  })
  .catch({});

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

export function saveChecklistState(storage: Pick<Storage, "setItem">, state: ChecklistState) {
  try {
    storage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
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
