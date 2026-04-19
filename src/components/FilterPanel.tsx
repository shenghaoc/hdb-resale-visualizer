import type { ChangeEvent } from "react";
import { formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import type { FilterState, Manifest } from "@/types/data";

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

function parseOptionalNumber(event: ChangeEvent<HTMLInputElement>) {
  return event.target.value === "" ? null : Number(event.target.value);
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
        <span>Flat model (optional)</span>
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
        <p className="field__hint">
          Useful when the model family matters. Placeholder values are hidden.
        </p>
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
          <span>Remaining lease min (years)</span>
          <input
            className="field__input"
            inputMode="numeric"
            min={0}
            max={99}
            placeholder="e.g. 60"
            type="number"
            value={filters.remainingLeaseMin ?? ""}
            onChange={(event) => onChange({ remainingLeaseMin: parseOptionalNumber(event) })}
          />
        </label>
      </div>

      <section className="filter-range">
        <div className="filter-range__header">
          <div>
            <span className="eyebrow">Transaction window</span>
            <h3>Date window</h3>
          </div>
          <span className="pill">
            {formatMonth(minMonth)} to {formatMonth(maxMonth)}
          </span>
        </div>
        <p className="field__hint">Leave both blank to scan the full history.</p>
        <div className="filter-range__fields">
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
      </section>

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

      <section className="provenance-card">
        <div className="panel__header panel__header--compact">
          <div>
            <span className="eyebrow">Data provenance</span>
            <h3>What this tool shows</h3>
          </div>
          <span className="pill">{formatNumber(manifest.counts.blocks)} blocks</span>
        </div>

        <div className="provenance-card__grid">
          <article>
            <span>Artifacts built</span>
            <strong>{formatDateTime(manifest.generatedAt)}</strong>
          </article>
          <article>
            <span>Market window</span>
            <strong>
              {formatMonth(manifest.dataWindow.minMonth)} to{" "}
              {formatMonth(manifest.dataWindow.maxMonth)}
            </strong>
          </article>
          <article>
            <span>Transactions</span>
            <strong>{formatNumber(manifest.counts.transactions)}</strong>
          </article>
          <article>
            <span>MRT metric</span>
            <strong>Straight-line distance</strong>
          </article>
        </div>

        <p className="provenance-card__note">
          Official HDB resale data, HDB property information, and LTA station exits.
          This app helps compare real market evidence and does not predict future
          prices.
        </p>
      </section>
    </aside>
  );
}
