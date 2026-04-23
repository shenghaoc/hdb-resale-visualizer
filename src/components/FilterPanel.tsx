import { useId } from "react";
import { formatMonth } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { FilterOptions, FilterState } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FilterPanelProps = {
  filters: FilterState;
  options: FilterOptions;
  minMonth: string;
  maxMonth: string;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
};

const ALL_VALUE = "__all__";

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
  onChange: (value: string) => void;
};

function SelectField({ label, allLabel, value, options, onChange }: SelectFieldProps) {
  const labelId = useId();
  const triggerValue = value || ALL_VALUE;

  return (
    <Field>
      <FieldContent>
        <FieldLabel id={labelId}>{label}</FieldLabel>
        <Select onValueChange={(nextValue) => onChange(nextValue === ALL_VALUE ? "" : nextValue)} value={triggerValue}>
          <SelectTrigger aria-labelledby={labelId}>
            <SelectValue placeholder={allLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
}

export function FilterPanel({ filters, options, minMonth, maxMonth, onChange, onReset }: FilterPanelProps) {
  const { locale, t } = useI18n();

  return (
    <aside data-testid="filters-panel">
      <Card size="sm" className="bg-background">
        <CardHeader className="gap-3 border-b border-border pb-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <CardTitle className="text-2xl">{t("filters.title")}</CardTitle>
            </div>
            <CardAction>
              <Button onClick={onReset} size="sm" variant="ghost">
                {t("filters.reset")}
              </Button>
            </CardAction>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 pt-4">
          <Field>
            <FieldContent>
              <FieldLabel htmlFor="search">{t("filters.searchLabel")}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="search"
                  placeholder={t("filters.searchPlaceholder")}
                  value={filters.search}
                  onChange={(event) => onChange({ search: event.target.value })}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{t("filters.search")}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </FieldContent>
          </Field>

          <div className="grid gap-4 lg:grid-cols-2">
            <SelectField
              allLabel={t("filters.allTowns")}
              label={t("filters.town")}
              options={options.towns}
              value={filters.town}
              onChange={(town) => onChange({ town })}
            />
            <SelectField
              allLabel={t("filters.allTypes")}
              label={t("filters.flatType")}
              options={options.flatTypes}
              value={filters.flatType}
              onChange={(flatType) => onChange({ flatType })}
            />
          </div>

          <SelectField
            allLabel={t("filters.allModels")}
            label={t("filters.flatModel")}
            options={options.flatModels}
            value={filters.flatModel}
            onChange={(flatModel) => onChange({ flatModel })}
          />

          <div className="flex flex-col gap-6">
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium">{t("filters.budgetRange")}</legend>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field>
                  <FieldContent>
                    <FieldLabel htmlFor="budget-min" className="sr-only">{t("filters.minBudget")}</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>SGD</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="budget-min"
                        data-no-spinner="true"
                        inputMode="numeric"
                        min={0}
                        placeholder={t("filters.noMinimum")}
                        type="number"
                        value={filters.budgetMin ?? ""}
                        onChange={(event) => onChange({ budgetMin: parseOptionalNumberValue(event.target.value) })}
                        aria-description="Enter the minimum budget in SGD"
                      />
                    </InputGroup>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldContent>
                    <FieldLabel htmlFor="budget-max" className="sr-only">{t("filters.maxBudget")}</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <InputGroupText>SGD</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="budget-max"
                        data-no-spinner="true"
                        inputMode="numeric"
                        min={0}
                        placeholder={t("filters.noMaximum")}
                        type="number"
                        value={filters.budgetMax ?? ""}
                        onChange={(event) => onChange({ budgetMax: parseOptionalNumberValue(event.target.value) })}
                        aria-description="Enter the maximum budget in SGD"
                      />
                    </InputGroup>
                  </FieldContent>
                </Field>
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium">{t("filters.floorAreaRange")}</legend>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field>
                  <FieldContent>
                    <FieldLabel htmlFor="area-min" className="sr-only">{t("filters.minFloorArea")}</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>sqm</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="area-min"
                        data-no-spinner="true"
                        inputMode="decimal"
                        min={0}
                        placeholder={t("filters.minSqm")}
                        type="number"
                        value={filters.areaMin ?? ""}
                        onChange={(event) => onChange({ areaMin: parseOptionalNumberValue(event.target.value) })}
                        aria-description="Enter the minimum floor area in square meters"
                      />
                    </InputGroup>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldContent>
                    <FieldLabel htmlFor="area-max" className="sr-only">{t("filters.maxFloorArea")}</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>sqm</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id="area-max"
                        data-no-spinner="true"
                        inputMode="decimal"
                        min={0}
                        placeholder={t("filters.maxSqm")}
                        type="number"
                        value={filters.areaMax ?? ""}
                        onChange={(event) => onChange({ areaMax: parseOptionalNumberValue(event.target.value) })}
                        aria-description="Enter the maximum floor area in square meters"
                      />
                    </InputGroup>
                  </FieldContent>
                </Field>
              </div>
            </fieldset>

            <Field>
              <FieldContent>
                <FieldLabel htmlFor="remaining-lease">{t("filters.remainingLeaseMin")}</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="remaining-lease"
                    data-no-spinner="true"
                    inputMode="numeric"
                    max={99}
                    min={0}
                    placeholder={t("filters.optional")}
                    type="number"
                    value={filters.remainingLeaseMin ?? ""}
                    onChange={(event) => onChange({ remainingLeaseMin: parseOptionalNumberValue(event.target.value) })}
                    aria-description="Minimum remaining lease in years"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>yrs</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              </FieldContent>
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t("filters.transactionWindow")}</legend>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
              <span className="text-sm font-semibold" aria-hidden="true">{t("filters.transactionWindow")}</span>
              <Badge variant="secondary" className="text-xs">
                {formatMonth(minMonth, locale)} to {formatMonth(maxMonth, locale)}
              </Badge>
            </div>
            <div className="grid gap-4 pt-2 lg:grid-cols-2">
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor="start-month">{t("filters.startMonth")}</FieldLabel>
                  <Input
                    id="start-month"
                    max={maxMonth}
                    min={minMonth}
                    type="month"
                    value={filters.startMonth ?? ""}
                    onChange={(event) => onChange({ startMonth: event.target.value === "" ? null : event.target.value })}
                    aria-description="Start of the transaction window"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor="end-month">{t("filters.endMonth")}</FieldLabel>
                  <Input
                    id="end-month"
                    max={maxMonth}
                    min={minMonth}
                    type="month"
                    value={filters.endMonth ?? ""}
                    onChange={(event) => onChange({ endMonth: event.target.value === "" ? null : event.target.value })}
                    aria-description="End of the transaction window"
                  />
                </FieldContent>
              </Field>
            </div>
          </fieldset>

          <Field>
            <FieldContent>
              <FieldLabel htmlFor="mrt-max">{t("filters.maxMrtDistance")}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="mrt-max"
                  data-no-spinner="true"
                  inputMode="numeric"
                  min={0}
                  placeholder={t("filters.optional")}
                  type="number"
                  value={filters.mrtMax ?? ""}
                  onChange={(event) => onChange({ mrtMax: parseOptionalNumberValue(event.target.value) })}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>m</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </FieldContent>
          </Field>
        </CardContent>
      </Card>
    </aside>
  );
}
