import { useId } from "react";
import { PanelLeftClose, RefreshCw } from "lucide-react";
import { formatMonth } from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import { localizeFlatType, localizeTownName } from "@/shared/lib/i18n/domain";
import { isAffordabilityProfileComplete } from "@/shared/lib/affordability";
import type { AffordabilityMode, FilterOptions, FilterState } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type FilterPanelDesktopToggle = {
  isOpen: boolean;
  onToggle: () => void;
};

type FilterPanelProps = {
  filters: FilterState;
  options: FilterOptions;
  minMonth: string;
  maxMonth: string;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  desktopToggle?: FilterPanelDesktopToggle;
  searchProfile?: SearchProfile | null;
};

const ALL_VALUE = "__all__";

const FILTER_INLINE_ACTION_CLASS =
  "gap-1 rounded-none px-2 text-[0.75rem] font-extrabold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

function parseOptionalNumberValue(value: string) {
  if (value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type SelectFieldProps = {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  renderOptionLabel?: (value: string) => string;
  onChange: (value: string) => void;
};

function SelectField({
  label,
  allLabel,
  value,
  options,
  renderOptionLabel = (option) => option,
  onChange,
}: SelectFieldProps) {
  const labelId = useId();
  const triggerValue = value || ALL_VALUE;

  return (
    <Field>
      <FieldContent>
        <FieldLabel id={labelId}>{label}</FieldLabel>
        <Select
          onValueChange={(nextValue) => onChange(nextValue === ALL_VALUE ? "" : nextValue)}
          value={triggerValue}
        >
          <SelectTrigger
            aria-labelledby={labelId}
            className="h-9 w-full rounded-none border-border/40 bg-card px-2"
          >
            <SelectValue placeholder={allLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {renderOptionLabel(option)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}

type AffordabilityFilterFieldProps = {
  value: AffordabilityMode;
  onChange: (next: AffordabilityMode) => void;
  disabled: boolean;
  t: ReturnType<typeof useI18n>["t"];
};

function AffordabilityFilterField({ value, onChange, disabled, t }: AffordabilityFilterFieldProps) {
  const legendId = useId();
  const buttonClass =
    "h-7 w-full justify-start rounded-none px-2.5 text-[0.75rem] font-extrabold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50";

  const options: ReadonlyArray<{ mode: AffordabilityMode; label: string; aria: string }> = [
    {
      mode: "",
      label: t("affordability.filter.all"),
      aria: t("affordability.filter.all"),
    },
    {
      mode: "comfortable",
      label: t("affordability.filter.comfortable"),
      aria: t("affordability.filter.comfortable"),
    },
    {
      mode: "stretch",
      label: t("affordability.filter.stretch"),
      aria: t("affordability.filter.stretch"),
    },
  ];

  const control = (
    <ButtonGroup
      orientation="vertical"
      aria-labelledby={legendId}
      data-testid="affordability-filter-toggle"
      data-affordability-mode={value || "all"}
      data-affordability-disabled={disabled ? "true" : "false"}
      className="w-full gap-0 rounded-none border border-border/40 bg-card p-0.5"
    >
      {options.map((option) => {
        const isActive = (value || "") === option.mode;
        return (
          <Button
            key={option.mode || "all"}
            type="button"
            size="xs"
            variant={isActive ? "default" : "ghost"}
            aria-pressed={isActive}
            aria-label={option.aria}
            disabled={disabled}
            onClick={() => onChange(option.mode)}
            className={buttonClass}
          >
            {option.label}
          </Button>
        );
      })}
    </ButtonGroup>
  );

  return (
    <Field>
      <FieldContent>
        <FieldLabel id={legendId}>{t("affordability.filter.legend")}</FieldLabel>
        {disabled ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="block w-full"
                  aria-labelledby={legendId}
                  aria-describedby={`${legendId}-tooltip`}
                >
                  {control}
                </span>
              </TooltipTrigger>
              <TooltipContent id={`${legendId}-tooltip`}>
                {t("affordability.filter.disabledTooltip")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          control
        )}
      </FieldContent>
    </Field>
  );
}

export function FilterPanel(props: FilterPanelProps) {
  const { filters, options, minMonth, maxMonth, onChange, onReset, desktopToggle, searchProfile } =
    props;
  const { locale, t } = useI18n();

  const affordabilityEnabled = searchProfile
    ? isAffordabilityProfileComplete({
        monthlyIncome: searchProfile.monthlyIncome,
        cpfOABalance: searchProfile.cpfOABalance,
        age: searchProfile.age,
        coApplicantAge: searchProfile.coApplicantAge,
      })
    : false;

  return (
    <aside data-testid="filters-panel">
      <Card className="flex min-h-0 flex-1 flex-col gap-0 border-none bg-transparent py-0 shadow-none">
        <CardHeader className="border-b border-border/30 bg-background px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="v2-section-title mr-auto min-w-0 truncate">
              {t("filters.title")}
            </CardTitle>
            {desktopToggle ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="filters-panel-toggle"
                className="hidden h-10 shrink-0 gap-1.5 rounded-none border-border/40 bg-card px-2.5 text-[0.75rem] font-extrabold normal-case tracking-wide text-muted-foreground hover:text-foreground sm:inline-flex"
                onClick={desktopToggle.onToggle}
                aria-expanded={desktopToggle.isOpen}
              >
                <PanelLeftClose
                  data-icon="inline-start"
                  className="size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {t("filters.hidePanel")}
              </Button>
            ) : null}
            <CardAction>
              <Button
                onClick={onReset}
                size="xs"
                variant="ghost"
                className={cn("h-7", FILTER_INLINE_ACTION_CLASS)}
              >
                <RefreshCw
                  data-icon="inline-start"
                  className="size-3 shrink-0"
                  aria-hidden="true"
                />
                {t("filters.reset")}
              </Button>
            </CardAction>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5 px-3 pb-12 pt-3 sm:px-4">
          <FieldGroup className="gap-4">
            <FieldSet className="gap-4">
              <FieldLegend className="v2-section-title">{t("filters.coreCriteria")}</FieldLegend>
              <div className="grid gap-4 lg:grid-cols-2">
                <SelectField
                  allLabel={t("filters.allTowns")}
                  label={t("filters.town")}
                  options={options.towns}
                  value={filters.town}
                  renderOptionLabel={(town) => localizeTownName(town, locale)}
                  onChange={(town) => onChange({ town })}
                />
                <SelectField
                  allLabel={t("filters.allTypes")}
                  label={t("filters.flatType")}
                  options={options.flatTypes}
                  value={filters.flatType}
                  renderOptionLabel={(flatType) => localizeFlatType(flatType, locale)}
                  onChange={(flatType) => onChange({ flatType })}
                />
              </div>

              <AffordabilityFilterField
                value={filters.affordable}
                onChange={(affordable) => onChange({ affordable })}
                disabled={!affordabilityEnabled}
                t={t}
              />

              <FieldSet className="gap-3">
                <FieldLegend className="v2-section-title">{t("filters.budgetRange")}</FieldLegend>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="budget-min" className="sr-only">
                        {t("filters.minBudget")}
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>SGD</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="budget-min"
                          data-no-spinner="true"
                          inputMode="numeric"
                          enterKeyHint="done"
                          min={0}
                          placeholder={t("filters.noMinimum")}
                          type="number"
                          value={filters.budgetMin ?? ""}
                          onChange={(event) =>
                            onChange({ budgetMin: parseOptionalNumberValue(event.target.value) })
                          }
                          aria-description={t("filters.a11y.minBudget")}
                        />
                      </InputGroup>
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="budget-max" className="sr-only">
                        {t("filters.maxBudget")}
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText>SGD</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="budget-max"
                          data-no-spinner="true"
                          inputMode="numeric"
                          enterKeyHint="done"
                          min={0}
                          placeholder={t("filters.noMaximum")}
                          type="number"
                          value={filters.budgetMax ?? ""}
                          onChange={(event) =>
                            onChange({ budgetMax: parseOptionalNumberValue(event.target.value) })
                          }
                          aria-description={t("filters.a11y.maxBudget")}
                        />
                      </InputGroup>
                    </FieldContent>
                  </Field>
                </div>
              </FieldSet>

              <div className="grid gap-4 lg:grid-cols-2">
                <Field>
                  <FieldContent>
                    <FieldLabel htmlFor="remaining-lease">
                      {t("filters.remainingLeaseMin")}
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="remaining-lease"
                        data-no-spinner="true"
                        inputMode="numeric"
                        enterKeyHint="done"
                        max={99}
                        min={0}
                        placeholder={t("filters.optional")}
                        type="number"
                        value={filters.remainingLeaseMin ?? ""}
                        onChange={(event) =>
                          onChange({
                            remainingLeaseMin: parseOptionalNumberValue(event.target.value),
                          })
                        }
                        aria-description={t("filters.a11y.remainingLeaseMin")}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{t("unit.years", { value: "" }).trim()}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldContent>
                    <FieldLabel htmlFor="mrt-max">{t("filters.maxMrtDistance")}</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="mrt-max"
                        data-no-spinner="true"
                        inputMode="numeric"
                        enterKeyHint="done"
                        min={0}
                        placeholder={t("filters.optional")}
                        type="number"
                        value={filters.mrtMax ?? ""}
                        aria-description={t("filters.a11y.maxMrtDistance")}
                        onChange={(event) =>
                          onChange({ mrtMax: parseOptionalNumberValue(event.target.value) })
                        }
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{t("unit.m", { value: "" }).trim()}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </FieldContent>
                </Field>
              </div>
            </FieldSet>

            <FieldSet className="gap-4">
              <FieldLegend className="v2-section-title">
                {t("filters.advancedRefinements")}
              </FieldLegend>
              <SelectField
                allLabel={t("filters.allModels")}
                label={t("filters.flatModel")}
                options={options.flatModels}
                value={filters.flatModel}
                onChange={(flatModel) => onChange({ flatModel })}
              />

              <FieldSet className="gap-3">
                <FieldLegend className="v2-section-title">
                  {t("filters.floorAreaRange")}
                </FieldLegend>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="area-min" className="sr-only">
                        {t("filters.minFloorArea")}
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>{t("unit.sqm", { value: "" }).trim()}</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="area-min"
                          data-no-spinner="true"
                          inputMode="decimal"
                          enterKeyHint="done"
                          min={0}
                          placeholder={t("filters.minSqm")}
                          type="number"
                          value={filters.areaMin ?? ""}
                          onChange={(event) =>
                            onChange({ areaMin: parseOptionalNumberValue(event.target.value) })
                          }
                          aria-description={t("filters.a11y.minFloorArea")}
                        />
                      </InputGroup>
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="area-max" className="sr-only">
                        {t("filters.maxFloorArea")}
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>{t("unit.sqm", { value: "" }).trim()}</InputGroupText>
                        </InputGroupAddon>
                        <InputGroupInput
                          id="area-max"
                          data-no-spinner="true"
                          inputMode="decimal"
                          enterKeyHint="done"
                          min={0}
                          placeholder={t("filters.maxSqm")}
                          type="number"
                          value={filters.areaMax ?? ""}
                          onChange={(event) =>
                            onChange({ areaMax: parseOptionalNumberValue(event.target.value) })
                          }
                          aria-description={t("filters.a11y.maxFloorArea")}
                        />
                      </InputGroup>
                    </FieldContent>
                  </Field>
                </div>
              </FieldSet>

              <FieldSet className="gap-3">
                <FieldLegend className="sr-only">{t("filters.transactionWindow")}</FieldLegend>
                <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-2.5">
                  <span className="v2-section-title" aria-hidden="true">
                    {t("filters.transactionWindow")}
                  </span>
                  <Badge variant="secondary" className="h-5 text-[length:var(--text-xs)] font-bold">
                    {formatMonth(minMonth, locale)} to {formatMonth(maxMonth, locale)}
                  </Badge>
                </div>
                <div className="grid gap-4 pt-2 lg:grid-cols-2">
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="start-month">{t("filters.startMonth")}</FieldLabel>
                      <MonthPicker
                        id="start-month"
                        value={filters.startMonth}
                        onChange={(value) => onChange({ startMonth: value })}
                        minMonth={minMonth}
                        maxMonth={filters.endMonth ?? maxMonth}
                        previousYearLabel={t("filters.previousYear")}
                        nextYearLabel={t("filters.nextYear")}
                      />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldLabel htmlFor="end-month">{t("filters.endMonth")}</FieldLabel>
                      <MonthPicker
                        id="end-month"
                        value={filters.endMonth}
                        onChange={(value) => onChange({ endMonth: value })}
                        minMonth={filters.startMonth ?? minMonth}
                        maxMonth={maxMonth}
                        previousYearLabel={t("filters.previousYear")}
                        nextYearLabel={t("filters.nextYear")}
                      />
                    </FieldContent>
                  </Field>
                </div>
              </FieldSet>
            </FieldSet>
          </FieldGroup>
        </CardContent>
      </Card>
    </aside>
  );
}
