import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronUp, Info } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { formatCompactCurrency, formatMonth, formatNumber } from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import { LOW_SAMPLE_THRESHOLD, type ComparableTransaction } from "../../shared/comparable-engine";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// ── Constants ──────────────────────────────────────────────────────────────

// ── Sort types ─────────────────────────────────────────────────────────────

type SortKey = "month" | "floorAreaSqm" | "resalePrice" | "pricePerSqm" | "similarity";
type SortDirection = "asc" | "desc";

const DEFAULT_SORT_DIRECTIONS: Record<SortKey, SortDirection> = {
  month: "asc",
  floorAreaSqm: "asc",
  resalePrice: "desc",
  pricePerSqm: "desc",
  similarity: "desc",
};

const SORT_KEY_I18N: Record<SortKey, string> = {
  similarity: "evidence.col.similarity",
  month: "evidence.col.month",
  resalePrice: "evidence.col.price",
  pricePerSqm: "evidence.col.priceSqm",
  floorAreaSqm: "evidence.col.area",
};

const SORT_KEY_ORDER: SortKey[] = [
  "similarity",
  "month",
  "resalePrice",
  "pricePerSqm",
  "floorAreaSqm",
];

// ── Sort helper ────────────────────────────────────────────────────────────

type ExtendedComparable = ComparableTransaction & {
  rawResalePrice?: number;
  rawPricePerSqm?: number;
};

function sortComparables<T extends ComparableTransaction>(
  comparables: ReadonlyArray<T>,
  sortKey: SortKey,
  sortDirection: SortDirection,
): T[] {
  const dir = sortDirection === "asc" ? 1 : -1;

  return [...comparables].sort((a, b) => {
    let cmp: number;
    if (sortKey === "month") {
      cmp = a.month.localeCompare(b.month);
    } else {
      cmp = a[sortKey] - b[sortKey];
    }
    if (cmp !== 0) return cmp * dir;
    // Tie-break: similarity desc, then month desc
    if (a.similarity !== b.similarity) return b.similarity - a.similarity;
    return b.month.localeCompare(a.month);
  });
}

// ── Props ──────────────────────────────────────────────────────────────────

type ComparableEvidenceTableProps = {
  comparables: ReadonlyArray<ExtendedComparable>;
  referenceMonth: string;
  widenedSearch: boolean;
  caveats: ReadonlyArray<string>;
  adjustmentApplied?: boolean;
};

// ── Component ──────────────────────────────────────────────────────────────

export function ComparableEvidenceTable({
  comparables,
  referenceMonth,
  widenedSearch,
  caveats,
  adjustmentApplied = false,
}: ComparableEvidenceTableProps) {
  const { locale, t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("similarity");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [explainerOpen, setExplainerOpen] = useState(false);

  const sorted = useMemo(
    () => sortComparables(comparables, sortKey, sortDirection),
    [comparables, sortKey, sortDirection],
  );

  const hasAdjustedPrice = useMemo(
    () => adjustmentApplied && comparables.some((tx) => tx.rawResalePrice != null),
    [adjustmentApplied, comparables],
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(DEFAULT_SORT_DIRECTIONS[key]);
    }
  }

  function ariaSortValue(key: SortKey): "ascending" | "descending" | "none" {
    if (key !== sortKey) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (comparables.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        {caveats.length > 0 && (
          <div className="rounded-md bg-warning/5 p-3">
            <ul className="flex flex-col gap-1.5">
              {caveats.map((caveat, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-warning">
                  <AlertTriangle data-icon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  <span>{caveat}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-start gap-3 rounded-md border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
          <Info
            data-icon
            className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
            aria-hidden="true"
          />
          <span>{t("evidence.empty")}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {/* ── Caveat banner ─────────────────────────────────────────────── */}
      {caveats.length > 0 && (
        <div className="rounded-md bg-warning/5 p-3">
          <ul className="flex flex-col gap-1.5">
            {caveats.map((caveat, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-warning">
                <AlertTriangle data-icon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                <span>{caveat}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── "Why these comparables?" ──────────────────────────────────── */}
      <div className="rounded-md bg-muted/10">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left v2-field-label transition-colors hover:bg-muted/20"
          aria-expanded={explainerOpen}
          aria-controls="why-comparables-explainer"
          onClick={() => setExplainerOpen((o) => !o)}
        >
          <span>{t("evidence.whyTitle")}</span>
          <ChevronDown
            data-icon
            className={cn("size-3.5 shrink-0 transition-transform", explainerOpen && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        {explainerOpen && (
          <div
            id="why-comparables-explainer"
            className="px-3 pb-3 text-xs leading-relaxed text-muted-foreground"
          >
            {widenedSearch ? t("evidence.whyWidened") : t("evidence.whyNormal")}
            {comparables.length < LOW_SAMPLE_THRESHOLD && <> {t("evidence.whyLowSample")}</>}
            {referenceMonth && (
              <span className="mt-1 block text-[0.75rem] text-muted-foreground/70">
                {t("evidence.referenceDate", { month: formatMonth(referenceMonth, locale) })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Desktop table ─────────────────────────────────────────────── */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label={t("evidence.col.month")}
                sortKey="month"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                ariaSortValue={ariaSortValue("month")}
                onSort={handleSort}
              />
              <TableHead className="text-[var(--text-xs)] font-extrabold tracking-[var(--tracking-label)]">
                {t("evidence.col.location")}
              </TableHead>
              <TableHead className="text-[var(--text-xs)] font-extrabold tracking-[var(--tracking-label)]">
                {t("evidence.col.flatType")}
              </TableHead>
              <TableHead className="text-[var(--text-xs)] font-extrabold tracking-[var(--tracking-label)]">
                {t("evidence.col.storey")}
              </TableHead>
              <SortableHead
                label={t("evidence.col.area")}
                sortKey="floorAreaSqm"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                ariaSortValue={ariaSortValue("floorAreaSqm")}
                onSort={handleSort}
              />
              <TableHead className="text-[var(--text-xs)] font-extrabold tracking-[var(--tracking-label)]">
                {t("evidence.col.lease")}
              </TableHead>
              <SortableHead
                label={t("evidence.col.price")}
                sortKey="resalePrice"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                ariaSortValue={ariaSortValue("resalePrice")}
                onSort={handleSort}
                align="right"
              />
              <SortableHead
                label={t("evidence.col.priceSqm")}
                sortKey="pricePerSqm"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                ariaSortValue={ariaSortValue("pricePerSqm")}
                onSort={handleSort}
                align="right"
              />
              {hasAdjustedPrice && (
                <TableHead className="text-right text-[var(--text-xs)] font-extrabold tracking-[var(--tracking-label)]">
                  {t("evidence.col.adjPrice")}
                </TableHead>
              )}
              <SortableHead
                label={t("evidence.col.similarity")}
                sortKey="similarity"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                ariaSortValue={ariaSortValue("similarity")}
                onSort={handleSort}
              />
              <TableHead className="text-[var(--text-xs)] font-extrabold tracking-[var(--tracking-label)]">
                {t("evidence.col.matchReasons")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((tx) => (
              <TableRow key={tx.transactionId}>
                <TableCell className="text-xs tabular-nums">
                  {formatMonth(tx.month, locale)}
                </TableCell>
                <TableCell className="max-w-[10rem] truncate text-xs">
                  {tx.block} {tx.streetName}
                </TableCell>
                <TableCell className="text-xs">{tx.flatType}</TableCell>
                <TableCell className="text-xs">{tx.storeyRange}</TableCell>
                <TableCell className="text-xs tabular-nums">
                  {Math.round(tx.floorAreaSqm)}
                  {t("unit.sqmShort")}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {tx.leaseCommenceDate != null ? tx.leaseCommenceDate : "—"}
                </TableCell>
                <TableCell className="text-right text-xs font-bold tabular-nums">
                  {formatCompactCurrency(tx.resalePrice, locale)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatNumber(tx.pricePerSqm, 0, locale)}
                </TableCell>
                {hasAdjustedPrice && (
                  <TableCell className="text-right text-xs tabular-nums">
                    {tx.rawResalePrice != null
                      ? formatCompactCurrency(tx.rawResalePrice, locale)
                      : "—"}
                  </TableCell>
                )}
                <TableCell>
                  <SimilarityBar similarity={tx.similarity} />
                </TableCell>
                <TableCell>
                  <MatchReasonBadges reasons={tx.matchReasons} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Mobile card layout ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:hidden">
        {/* Mobile sort controls */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <ArrowUpDown
            data-icon
            className="size-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {SORT_KEY_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[var(--text-xs)] font-semibold uppercase tracking-wider transition-colors",
                key === sortKey
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/20 text-muted-foreground hover:bg-muted/40",
              )}
              onClick={() => handleSort(key)}
              aria-pressed={key === sortKey}
            >
              {t(SORT_KEY_I18N[key])}
              {key === sortKey && (sortDirection === "asc" ? " ↑" : " ↓")}
            </button>
          ))}
        </div>
        {sorted.map((tx) => (
          <article
            key={tx.transactionId}
            className="rounded-md bg-muted/20 p-3"
            aria-label={`${formatCompactCurrency(tx.resalePrice, locale)}, ${tx.block} ${tx.streetName}, ${formatMonth(tx.month, locale)}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <span className="block text-sm font-bold tabular-nums">
                  {formatCompactCurrency(tx.resalePrice, locale)}
                </span>
                {hasAdjustedPrice && tx.rawResalePrice != null && (
                  <span className="mt-0.5 block text-[var(--text-xs)] tabular-nums text-muted-foreground">
                    {t("evidence.col.adjPrice")}: {formatCompactCurrency(tx.rawResalePrice, locale)}
                  </span>
                )}
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(tx.floorAreaSqm)}
                {t("unit.sqmShort")} ·{" "}
                {t("unit.sqmCurrency", { value: formatNumber(tx.pricePerSqm, 0, locale) })}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {tx.block} {tx.streetName}
            </div>
            <div className="mt-0.5 text-[0.75rem] uppercase tracking-wider text-muted-foreground">
              {tx.flatType} · {tx.storeyRange}
              {tx.leaseCommenceDate != null &&
                ` · ${t("evidence.leasePrefix")}${tx.leaseCommenceDate}`}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <Badge variant="secondary" className="h-5 shrink-0 font-mono text-[var(--text-xs)]">
                {formatMonth(tx.month, locale)}
              </Badge>
              <SimilarityBar similarity={tx.similarity} />
            </div>
            {tx.matchReasons.length > 0 && (
              <div className="mt-1.5">
                <MatchReasonBadges reasons={tx.matchReasons} />
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

// ── SortableHead ───────────────────────────────────────────────────────────

function SortableHead({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  ariaSortValue,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDirection: SortDirection;
  ariaSortValue: "ascending" | "descending" | "none";
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const isActive = sortKey === activeSortKey;
  const SortIcon = isActive
    ? sortDirection === "asc"
      ? ChevronUp
      : ChevronDown
    : DEFAULT_SORT_DIRECTIONS[sortKey] === "asc"
      ? ChevronUp
      : ChevronDown;

  return (
    <TableHead aria-sort={ariaSortValue} className={cn(align === "right" && "text-right")}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 text-[var(--text-xs)] font-extrabold uppercase tracking-[var(--tracking-label)] transition-colors hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <SortIcon
          data-icon
          className={cn("size-3", !isActive && "opacity-40")}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}

// ── SimilarityBar ──────────────────────────────────────────────────────────

function SimilarityBar({ similarity }: { similarity: number }) {
  const pct = Math.round(similarity * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-12 rounded-full bg-muted/40">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[var(--text-xs)] font-mono tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

// ── MatchReasonBadges ──────────────────────────────────────────────────────

function MatchReasonBadges({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((reason) => (
        <Badge
          key={reason}
          variant="outline"
          className="h-4 border border-border/40 px-1 text-[var(--text-xs)] font-medium normal-case tracking-normal"
        >
          {reason}
        </Badge>
      ))}
    </div>
  );
}
