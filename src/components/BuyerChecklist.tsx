import { useId } from "react";
import { CheckSquare } from "lucide-react";
import { CHECKLIST_ITEMS, type ChecklistItemId } from "@/features/listing-check/checklist";
import type { Translator } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

type BuyerChecklistProps = {
  addressKey: string;
  checkedItems: ChecklistItemId[];
  onToggle: (addressKey: string, itemId: ChecklistItemId) => void;
  t: Translator;
  className?: string;
};

export function BuyerChecklist({
  addressKey,
  checkedItems,
  onToggle,
  t,
  className,
}: BuyerChecklistProps) {
  const headingId = useId();

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/10 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground" id={headingId}>
        <CheckSquare data-icon className="size-3.5" aria-hidden="true" />
        <span className="v2-section-title !mb-0">{t("shortlist.checklist.title")}</span>
      </div>

      <div className="flex flex-col gap-1" role="group" aria-labelledby={headingId}>
        {CHECKLIST_ITEMS.map((itemId) => {
          const isChecked = checkedItems.includes(itemId);
          const inputId = `checklist-${addressKey}-${itemId}`;
          return (
            <label
              key={itemId}
              htmlFor={inputId}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-muted/50",
                isChecked && "text-muted-foreground line-through",
              )}
            >
              <input
                id={inputId}
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={isChecked}
                onChange={() => onToggle(addressKey, itemId)}
              />
              <span className="flex-1">{t(`shortlist.checklist.${itemId}`)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
