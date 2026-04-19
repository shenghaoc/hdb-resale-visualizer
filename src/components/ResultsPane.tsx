import { useRef, useMemo, useState } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, createColumnHelper, type SortingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatCompactCurrency, formatMeters, formatMonth, formatRemainingLease } from "@/lib/format";
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
  columnHelper.accessor((row) => row.leaseCommenceRange, {
    id: "lease",
    header: "Lease rem.",
    sortingFn: (rowA, rowB) => {
      const currentYear = new Date().getFullYear();
      const leaseA = 99 - (currentYear - rowA.original.leaseCommenceRange[1]);
      const leaseB = 99 - (currentYear - rowB.original.leaseCommenceRange[1]);
      return leaseA - leaseB;
    },
    cell: (info) => formatRemainingLease(info.getValue()),
  }),
  columnHelper.accessor("nearestMrt", {
    header: "MRT",
    sortingFn: (rowA, rowB) => {
      const distA = rowA.original.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
      const distB = rowB.original.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
      return distA - distB;
    },
    cell: (info) =>
      info.getValue() ? formatMeters(info.getValue()!.distanceMeters) : "—",
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
  const [sorting, setSorting] = useState<SortingState>([
    { id: "medianPrice", desc: false },
  ]);

  // Separate selected block from the rest so it can be pinned at the top
  const { selectedBlock, tableBlocks } = useMemo(() => {
    let selected: BlockSummary | undefined;
    const rest: BlockSummary[] = [];
    for (const b of blocks) {
      if (b.addressKey === selectedAddressKey) {
        selected = b;
      } else {
        rest.push(b);
      }
    }
    return { selectedBlock: selected, tableBlocks: rest };
  }, [blocks, selectedAddressKey]);

  const table = useReactTable({
    data: tableBlocks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const renderRow = (block: BlockSummary, isPinned = false) => {
    const isSaved = shortlistKeys.has(block.addressKey);
    return (
      <tr
        key={isPinned ? `pinned-${block.addressKey}` : block.addressKey}
        className={isPinned ? "is-selected" : undefined}
        onClick={() => onSelect(block.addressKey)}
      >
        <td>
          <div className="result-address">
            <strong>{block.block} {block.streetName}</strong>
            <span>{block.town}</span>
          </div>
        </td>
        <td>{formatCompactCurrency(block.medianPrice)}</td>
        <td>{formatRemainingLease(block.leaseCommenceRange)}</td>
        <td>{block.nearestMrt ? formatMeters(block.nearestMrt.distanceMeters) : "—"}</td>
        <td>{formatMonth(block.latestMonth)}</td>
        <td>
          <button
            className="button button--ghost button--compact"
            onClick={(event) => {
              event.stopPropagation();
              onToggleShortlist(block.addressKey);
            }}
            type="button"
          >
            {isSaved ? "★ Saved" : "☆ Save"}
          </button>
        </td>
      </tr>
    );
  };

  return (
    <section className="panel results-panel" data-testid="results-pane">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Current shortlist candidates</span>
          <h2>Filtered blocks</h2>
        </div>
        <span className="pill">{blocks.length} shown</span>
      </div>

      <div ref={parentRef} className="results-panel__table">
        {blocks.length === 0 ? (
          <div className="empty-state">
            No blocks match your current filters. Try broadening your search or resetting filters.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--surface)" }}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ cursor: header.column.getCanSort() ? "pointer" : "default" }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" ? " ↑" : ""}
                      {header.column.getIsSorted() === "desc" ? " ↓" : ""}
                    </th>
                  ))}
                  <th aria-label="Actions" />
                </tr>
              ))}
            </thead>
            <tbody>
              {selectedBlock && (
                <>
                  {renderRow(selectedBlock, true)}
                  <tr className="table-divider">
                    <td colSpan={columns.length + 1} style={{ padding: 0, height: "2px", background: "var(--accent)", opacity: 0.5 }} />
                  </tr>
                </>
              )}

              {virtualItems.length > 0 && (
                <tr style={{ height: `${virtualItems[0].start}px` }}>
                  <td colSpan={columns.length + 1} style={{ padding: 0 }} />
                </tr>
              )}

              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return renderRow(row.original);
              })}

              {virtualItems.length > 0 && (
                <tr
                  style={{
                    height: `${virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end}px`,
                  }}
                >
                  <td colSpan={columns.length + 1} style={{ padding: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
