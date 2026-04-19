import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from "@tanstack/react-table";
import { formatCompactCurrency, formatCurrency, formatMeters, formatNumber } from "@/lib/format";
import type { BlockSummary, ShortlistItem } from "@/types/data";

type ShortlistRow = {
  item: ShortlistItem;
  summary: BlockSummary;
};

type ShortlistDrawerProps = {
  isOpen: boolean;
  rows: ShortlistRow[];
  onToggleOpen: () => void;
  onRemove: (addressKey: string) => void;
  onUpdate: (addressKey: string, patch: Partial<ShortlistItem>) => void;
};

type GapInfo = {
  amount: number;
  label: string;
  tone: "positive" | "negative";
};

function getGapInfo(targetPrice: number | null, medianPrice: number): GapInfo | null {
  if (targetPrice === null) {
    return null;
  }

  const amount = Math.abs(targetPrice - medianPrice);

  if (targetPrice >= medianPrice) {
    return {
      amount,
      label: "Median is below your target",
      tone: "positive",
    };
  }

  return {
    amount,
    label: "Median is above your target",
    tone: "negative",
  };
}

function getRemainingLeaseRange(leaseCommenceRange: [number, number]) {
  const currentYear = new Date().getFullYear();
  const oldestRemaining = Math.max(0, 99 - (currentYear - leaseCommenceRange[0]));
  const newestRemaining = Math.max(0, 99 - (currentYear - leaseCommenceRange[1]));

  return [Math.min(oldestRemaining, newestRemaining), Math.max(oldestRemaining, newestRemaining)];
}

const columnHelper = createColumnHelper<ShortlistRow>();

const columns = [
  columnHelper.accessor((row) => `${row.summary.block} ${row.summary.streetName}`, {
    id: "address",
    header: "Address",
    cell: (info) => (
      <div className="result-address">
        <strong>{info.getValue()}</strong>
        <span>{info.row.original.summary.town}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.summary.medianPrice, {
    id: "median",
    header: "Market median",
    cell: (info) => (
      <div className="metric-stack">
        <strong>{formatCompactCurrency(info.getValue())}</strong>
        <span>{formatCurrency(info.getValue())}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.summary.pricePerSqftMedian, {
    id: "ppsf",
    header: "Price / sqft",
    cell: (info) => {
      const value = info.getValue();

      return value !== null ? (
        <div className="metric-stack">
          <strong>{formatCurrency(value)}</strong>
          <span>{formatNumber(info.row.original.summary.pricePerSqmMedian)} / sqm</span>
        </div>
      ) : (
        "N/A"
      );
    },
  }),
  columnHelper.accessor((row) => row.summary.floorAreaRange, {
    id: "area",
    header: "Area range",
    cell: (info) => (
      <div className="metric-stack">
        <strong>
          {formatNumber(info.getValue()[0], 1)} to {formatNumber(info.getValue()[1], 1)} sqm
        </strong>
        <span>{info.row.original.summary.flatTypes.join(", ")}</span>
      </div>
    ),
  }),
  columnHelper.accessor((row) => row.summary.leaseCommenceRange, {
    id: "lease",
    header: "Lease context",
    cell: (info) => {
      const remainingLeaseRange = getRemainingLeaseRange(info.getValue());

      return (
        <div className="metric-stack">
          <strong>
            {remainingLeaseRange[0]} to {remainingLeaseRange[1]} yrs left
          </strong>
          <span>
            Commence {info.getValue()[0]} to {info.getValue()[1]}
          </span>
        </div>
      );
    },
  }),
  columnHelper.accessor((row) => row.summary.nearestMrt, {
    id: "mrt",
    header: "Nearest MRT",
    cell: (info) =>
      info.getValue()
        ? `${info.getValue()!.stationName} • ${formatMeters(info.getValue()!.distanceMeters)}`
        : "No match",
  }),
];

export function ShortlistDrawer({
  isOpen,
  rows,
  onToggleOpen,
  onRemove,
  onUpdate,
}: ShortlistDrawerProps) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section className={`shortlist-drawer ${isOpen ? "shortlist-drawer--open" : ""}`}>
      <div className="shortlist-drawer__header">
        <div>
          <span className="eyebrow">Browser-only saved homes</span>
          <h2>Shortlist compare</h2>
          <p className="shortlist-drawer__subtitle">
            Your target price is your own buy threshold for the block. The gap
            compares that number against the current market median.
          </p>
        </div>
        <div className="shortlist-drawer__actions">
          <span className="pill">Best fit first</span>
          <span className="pill">{rows.length}/4 saved</span>
          <button className="button button--ghost" onClick={onToggleOpen} type="button">
            {isOpen ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div className="shortlist-drawer__body" data-testid="shortlist-drawer">
          <table>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                  <th>Your target price</th>
                  <th>Gap vs target</th>
                  <th>Notes</th>
                  <th />
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const gapInfo = getGapInfo(
                  row.original.item.targetPrice,
                  row.original.summary.medianPrice,
                );

                return (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    <td>
                      <input
                        className="field__input"
                        inputMode="numeric"
                        placeholder="850000"
                        type="number"
                        value={row.original.item.targetPrice ?? ""}
                        onChange={(event) =>
                          onUpdate(row.original.item.addressKey, {
                            targetPrice:
                              event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                      />
                      <p className="field__hint">Your personal max or goal price.</p>
                    </td>
                    <td>
                      {gapInfo ? (
                        <div className="metric-stack">
                          <strong className={`gap-value gap-value--${gapInfo.tone}`}>
                            {formatCurrency(gapInfo.amount)}
                          </strong>
                          <span className={`gap-badge gap-badge--${gapInfo.tone}`}>
                            {gapInfo.label}
                          </span>
                        </div>
                      ) : (
                        <span className="field__hint">Enter a target to compare.</span>
                      )}
                    </td>
                    <td>
                      <textarea
                        className="field__input field__input--textarea"
                        placeholder="Why this block stays in the running"
                        rows={2}
                        value={row.original.item.notes}
                        onChange={(event) =>
                          onUpdate(row.original.item.addressKey, {
                            notes: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="button button--ghost button--compact"
                        onClick={() => onRemove(row.original.item.addressKey)}
                        type="button"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
