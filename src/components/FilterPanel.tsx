import type { ChangeEvent } from "react";
import type { FilterState } from "@/types/data";

type FilterPanelProps = {
  filters: FilterState;
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

function parseOptionalNumber(event: ChangeEvent<HTMLInputElement>) {
  return event.target.value === "" ? null : Number(event.target.value);
}

export function FilterPanel({
  filters,
  options,
  minMonth,
  maxMonth,
  onChange,
  onReset,
}: FilterPanelProps) {
  return (
    <aside className="panel filters-panel" data-testid="filters-panel">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Filter the market</span>
          <h2>Live filters</h2>
        </div>
        <button className="button button--ghost" onClick={onReset} type="button">
          Reset
        </button>
      </div>

      <label className="field">
        <span>Search block or street</span>
        <input
          className="field__input"
          placeholder="e.g. 447 or Bedok Reservoir"
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
        />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Town</span>
          <select
            className="field__input"
            value={filters.town}
            onChange={(event) => onChange({ town: event.target.value })}
          >
            <option value="">All towns</option>
            {options.towns.map((town) => (
              <option key={town} value={town}>
                {town}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Flat type</span>
          <select
            className="field__input"
            value={filters.flatType}
            onChange={(event) => onChange({ flatType: event.target.value })}
          >
            <option value="">All types</option>
            {options.flatTypes.map((flatType) => (
              <option key={flatType} value={flatType}>
                {flatType}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Flat model</span>
        <select
          className="field__input"
          value={filters.flatModel}
          onChange={(event) => onChange({ flatModel: event.target.value })}
        >
          <option value="">All models</option>
          {options.flatModels.map((flatModel) => (
            <option key={flatModel} value={flatModel}>
              {flatModel}
            </option>
          ))}
        </select>
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Budget min (SGD)</span>
          <input
            className="field__input"
            inputMode="numeric"
            min={0}
            placeholder="300000"
            type="number"
            value={filters.budgetMin ?? ""}
            onChange={(event) => onChange({ budgetMin: parseOptionalNumber(event) })}
          />
        </label>
        <label className="field">
          <span>Budget max (SGD)</span>
          <input
            className="field__input"
            inputMode="numeric"
            min={0}
            placeholder="900000"
            type="number"
            value={filters.budgetMax ?? ""}
            onChange={(event) => onChange({ budgetMax: parseOptionalNumber(event) })}
          />
        </label>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Floor area min (sqm)</span>
          <input
            className="field__input"
            inputMode="decimal"
            min={0}
            placeholder="60"
            type="number"
            value={filters.areaMin ?? ""}
            onChange={(event) => onChange({ areaMin: parseOptionalNumber(event) })}
          />
        </label>
        <label className="field">
          <span>Floor area max (sqm)</span>
          <input
            className="field__input"
            inputMode="decimal"
            min={0}
            placeholder="120"
            type="number"
            value={filters.areaMax ?? ""}
            onChange={(event) => onChange({ areaMax: parseOptionalNumber(event) })}
          />
        </label>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Lease commence year min</span>
          <input
            className="field__input"
            inputMode="numeric"
            min={1960}
            placeholder="1985"
            type="number"
            value={filters.leaseMin ?? ""}
            onChange={(event) => onChange({ leaseMin: parseOptionalNumber(event) })}
          />
        </label>
        <label className="field">
          <span>Lease commence year max</span>
          <input
            className="field__input"
            inputMode="numeric"
            min={1960}
            placeholder="2020"
            type="number"
            value={filters.leaseMax ?? ""}
            onChange={(event) => onChange({ leaseMax: parseOptionalNumber(event) })}
          />
        </label>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Start month</span>
          <input
            className="field__input"
            max={maxMonth}
            min={minMonth}
            type="month"
            value={filters.startMonth ?? ""}
            onChange={(event) =>
              onChange({
                startMonth: event.target.value === "" ? null : event.target.value,
              })
            }
          />
        </label>
        <label className="field">
          <span>End month</span>
          <input
            className="field__input"
            max={maxMonth}
            min={minMonth}
            type="month"
            value={filters.endMonth ?? ""}
            onChange={(event) =>
              onChange({
                endMonth: event.target.value === "" ? null : event.target.value,
              })
            }
          />
        </label>
      </div>

      <label className="field">
        <span>Maximum MRT distance (m)</span>
        <input
          className="field__input"
          inputMode="numeric"
          min={0}
          placeholder="800"
          type="number"
          value={filters.mrtMax ?? ""}
          onChange={(event) => onChange({ mrtMax: parseOptionalNumber(event) })}
        />
      </label>
    </aside>
  );
}
