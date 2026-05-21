import { forwardRef, useCallback } from "react";
import { useIMEComposition } from "@/hooks/useIMEComposition";
import { MAX_SEARCH_QUERY_LENGTH } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type LocationSearchInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "defaultValue"
> & {
  value: string;
  onValueChange: (value: string) => void;
  inputGroupControl?: boolean;
};

export const LocationSearchInput = forwardRef<HTMLInputElement, LocationSearchInputProps>(
  function LocationSearchInput(
    {
      value,
      onValueChange,
      className,
      maxLength = MAX_SEARCH_QUERY_LENGTH,
      inputGroupControl = false,
      ...props
    },
    ref,
  ) {
    const handleValueChange = useCallback(
      (nextValue: string) => onValueChange(nextValue),
      [onValueChange],
    );
    const ime = useIMEComposition(handleValueChange);

    return (
      <Input
        ref={ref}
        data-slot={inputGroupControl ? "input-group-control" : "input"}
        maxLength={maxLength}
        value={ime.localValue ?? value}
        onCompositionStart={ime.onCompositionStart}
        onCompositionEnd={ime.onCompositionEnd}
        onChange={ime.onChange}
        className={cn(
          inputGroupControl &&
            "flex-1 border-0 bg-transparent ring-0 group-has-[>[data-align=inline-end]]/input-group:pr-2 group-has-[>[data-align=inline-start]]/input-group:pl-2 focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent",
          className,
        )}
        {...props}
      />
    );
  },
);
