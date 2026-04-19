import { useId } from "react";
import { formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import type { FilterState, Manifest } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type FilterPanelProps = {
  filters: FilterState;
  manifest: Manifest;
  options: {
    towns: string[];
    flatTypes: string[];
    flatModels: string[];
  };
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
        <Select
          onValueChange={(nextValue) => onChange(nextValue === ALL_VALUE ? "" : nextValue)}
          value={triggerValue}
        >
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

export function FilterPanel({
  filters,
  manifest,
  options,
  minMonth,
  maxMonth,
  onChange,
  onReset,
}: FilterPanelProps) {
  return (
    <aside data-testid="filters-panel">
      <Card size="sm" className="bg-background">
        <CardHeader className="gap-3 border-b border-border pb-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Badge variant="secondary">Filter the market</Badge>
              <CardTitle className="text-2xl">Live filters</CardTitle>
              <CardDescription>
                Keep the shortlist grounded in current resale evidence, not predictions.
              </CardDescription>
            </div>
            <CardAction>
              <Button onClick={onReset} size="sm" variant="ghost">
                Reset
              </Button>
            </CardAction>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 pt-6">
        <Field>
          <FieldContent>
            <FieldLabel htmlFor="search">Search block or street</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="search"
                placeholder="e.g. 447 or Bedok Reservoir"
                value={filters.search}
                onChange={(event) => onChange({ search: event.target.value })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>Search</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </FieldContent>
        </Field>

        <div className="grid gap-4 lg:grid-cols-2">
          <SelectField
            allLabel="All towns"
            label="Town"
            options={options.towns}
            value={filters.town}
            onChange={(town) => onChange({ town })}
          />
          <SelectField
            allLabel="All types"
            label="Flat type"
            options={options.flatTypes}
            value={filters.flatType}
            onChange={(flatType) => onChange({ flatType })}
          />
        </div>

        <SelectField
          allLabel="All models"
          label="Flat model"
          options={options.flatModels}
          value={filters.flatModel}
          onChange={(flatModel) => onChange({ flatModel })}
        />
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
          Placeholder and synthetic values are hidden to keep the menu beginner-friendly.
        </p>

        <FieldGroup>
          <Field>
            <FieldContent>
              <FieldLabel htmlFor="budget-min">Budget range</FieldLabel>
              <FieldDescription>Use both ends to narrow the shortlist.</FieldDescription>
              <div className="grid gap-4 lg:grid-cols-2">
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <InputGroupText>SGD</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="budget-min"
                    inputMode="numeric"
                    min={0}
                    placeholder="300000"
                    type="number"
                    value={filters.budgetMin ?? ""}
                    onChange={(event) =>
                      onChange({ budgetMin: parseOptionalNumberValue(event.target.value) })
                    }
                  />
                </InputGroup>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <InputGroupText>SGD</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="budget-max"
                    inputMode="numeric"
                    min={0}
                    placeholder="900000"
                    type="number"
                    value={filters.budgetMax ?? ""}
                    onChange={(event) =>
                      onChange({ budgetMax: parseOptionalNumberValue(event.target.value) })
                    }
                  />
                </InputGroup>
              </div>
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel htmlFor="area-min">Floor area range</FieldLabel>
              <FieldDescription>Metered in square metres.</FieldDescription>
              <div className="grid gap-4 lg:grid-cols-2">
                <InputGroup>
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>sqm</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="area-min"
                    inputMode="decimal"
                    min={0}
                    placeholder="60"
                    type="number"
                    value={filters.areaMin ?? ""}
                    onChange={(event) =>
                      onChange({ areaMin: parseOptionalNumberValue(event.target.value) })
                    }
                  />
                </InputGroup>
                <InputGroup>
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>sqm</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="area-max"
                    inputMode="decimal"
                    min={0}
                    placeholder="120"
                    type="number"
                    value={filters.areaMax ?? ""}
                    onChange={(event) =>
                      onChange({ areaMax: parseOptionalNumberValue(event.target.value) })
                    }
                  />
                </InputGroup>
              </div>
            </FieldContent>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel htmlFor="remaining-lease">Remaining lease min</FieldLabel>
              <FieldDescription>Use a target lease age if you care about runway.</FieldDescription>
              <InputGroup>
                <InputGroupInput
                  id="remaining-lease"
                  inputMode="numeric"
                  max={99}
                  min={0}
                  placeholder="e.g. 60"
                  type="number"
                  value={filters.remainingLeaseMin ?? ""}
                  onChange={(event) =>
                    onChange({
                      remainingLeaseMin: parseOptionalNumberValue(event.target.value),
                    })
                  }
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>yrs</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </FieldContent>
          </Field>
        </FieldGroup>

        <Card size="sm" className="border-none bg-muted/50 shadow-none ring-0">
          <CardHeader className="gap-2 border-b border-border/60 pb-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">Transaction window</CardTitle>
                <CardDescription>Leave both blank to scan the full history.</CardDescription>
              </div>
              <Badge variant="secondary">
                {formatMonth(minMonth)} to {formatMonth(maxMonth)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-5">
            <FieldGroup>
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor="start-month">Start month</FieldLabel>
                  <Input
                    id="start-month"
                    max={maxMonth}
                    min={minMonth}
                    type="month"
                    value={filters.startMonth ?? ""}
                    onChange={(event) =>
                      onChange({ startMonth: event.target.value === "" ? null : event.target.value })
                    }
                  />
                </FieldContent>
              </Field>
              <FieldSeparator>through</FieldSeparator>
              <Field>
                <FieldContent>
                  <FieldLabel htmlFor="end-month">End month</FieldLabel>
                  <Input
                    id="end-month"
                    max={maxMonth}
                    min={minMonth}
                    type="month"
                    value={filters.endMonth ?? ""}
                    onChange={(event) =>
                      onChange({ endMonth: event.target.value === "" ? null : event.target.value })
                    }
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Field>
          <FieldContent>
            <FieldLabel htmlFor="mrt-max">Maximum MRT distance</FieldLabel>
            <FieldDescription>Distance is measured in straight-line metres.</FieldDescription>
            <InputGroup>
              <InputGroupInput
                id="mrt-max"
                inputMode="numeric"
                min={0}
                placeholder="800"
                type="number"
                value={filters.mrtMax ?? ""}
                onChange={(event) =>
                  onChange({ mrtMax: parseOptionalNumberValue(event.target.value) })
                }
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>m</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </FieldContent>
        </Field>

        <Separator />

        <Card size="sm" className="border-none bg-muted/50 shadow-none ring-0">
          <CardHeader className="gap-2 border-b border-border/60 pb-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="eyebrow">Data provenance</span>
                <CardTitle className="text-base">What this tool shows</CardTitle>
              </div>
              <Badge>{formatNumber(manifest.counts.blocks)} blocks</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <article className="flex flex-col gap-2 border-b border-border pb-3">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Artifacts built</span>
                <strong className="text-sm text-foreground">
                  {formatDateTime(manifest.generatedAt)}
                </strong>
              </article>
              <article className="flex flex-col gap-2 border-b border-border pb-3">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Market window</span>
                <strong className="text-sm text-foreground">
                  {formatMonth(manifest.dataWindow.minMonth)} to{" "}
                  {formatMonth(manifest.dataWindow.maxMonth)}
                </strong>
              </article>
              <article className="flex flex-col gap-2 border-b border-border pb-3 sm:border-b-0">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Transactions</span>
                <strong className="text-sm text-foreground">
                  {formatNumber(manifest.counts.transactions)}
                </strong>
              </article>
              <article className="flex flex-col gap-2 border-b border-border pb-3 sm:border-b-0">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">MRT metric</span>
                <strong className="text-sm text-foreground">
                  Straight-line distance
                </strong>
              </article>
            </div>

            <p className="text-sm leading-6 text-muted-foreground">
              Official HDB resale data, HDB property information, and LTA station exits.
              This app helps compare real market evidence and does not predict future
              prices.
            </p>
          </CardContent>
        </Card>
        </CardContent>
      </Card>
    </aside>
  );
}
