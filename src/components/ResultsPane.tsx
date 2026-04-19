import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from "@tanstack/react-table";
import { formatCompactCurrency, formatMeters, formatMonth } from "@/lib/format";
import type { BlockSummary } from "@/types/data";

type ResultsPaneProps = {
  blocks: BlockSummary[];
  selectedAddressKey: string | null;
  shortlistKeys: Set<string>;
  onSelect: (addressKey: string) => void;
  onToggleShortlist: (addressKey: string) => void;
};

const columnHelper = createColumnHelper<BlockSummary>();

const columns = [
  columnHelper.accessor((row) => `${row.block} ${row.streetName}`, {
    id: "address",
    header: "Address",
    cell: (info) => (
      <div className="result-address">
        <strong>{info.getValue()}</strong>
        <span>{info.row.original.town}</span>
      </div>
    ),
  }),
  columnHelper.accessor("medianPrice", {
    header: "Median",
    cell: (info) => formatCompactCurrency(info.getValue()),
  }),
  columnHelper.accessor("transactionCount", {
    header: "Txns",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("nearestMrt", {
    header: "MRT",
    cell: (info) =>
      info.getValue() ? formatMeters(info.getValue()!.distanceMeters) : "No geocode",
  }),
  columnHelper.accessor("latestMonth", {
    header: "Latest",
    cell: (info) => formatMonth(info.getValue()),
  }),
];

export function ResultsPane({
  blocks,
  selectedAddressKey,
  shortlistKeys,
  onSelect,
  onToggleShortlist,
}: ResultsPaneProps) {
  const table = useReactTable({
    data: blocks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section className="panel results-panel" data-testid="results-pane">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Current shortlist candidates</span>
          <h2>Filtered blocks</h2>
        </div>
        <span className="pill">{blocks.length} shown</span>
      </div>

      <div className="results-panel__table">
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
                <th aria-label="Actions" />
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isSelected = row.original.addressKey === selectedAddressKey;
              const isSaved = shortlistKeys.has(row.original.addressKey);

              return (
                <tr
                  key={row.id}
                  className={isSelected ? "is-selected" : undefined}
                  onClick={() => onSelect(row.original.addressKey)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  <td>
                    <button
                      className="button button--ghost button--compact"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleShortlist(row.original.addressKey);
                      }}
                      type="button"
                    >
                      {isSaved ? "Saved" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
