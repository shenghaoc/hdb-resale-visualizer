import { useCallback, useId, useMemo, useState } from "react";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  GraduationCap,
  LayoutGrid,
  MapPin,
  ShoppingCart,
  Table as TableIcon,
  Trees,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { MAX_LEASE_DURATION, MAX_SHORTLIST_ITEMS, PRIMARY_BLUE, getCurrentYear } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useI18n, type Translator } from "@/lib/i18n";
import { localizeTownName } from "@/lib/i18n/domain";
import { useTheme } from "@/hooks/useTheme";
import { useIMEComposition } from "@/hooks/useIMEComposition";
import {
  formatCompactCurrency,
  formatCurrency,
  formatMeters,
  formatMinutesWalk,
  formatNumber,
  formatRemainingLease,
} from "@/lib/format";
import { rankShortlistRows, type CompareMode } from "@/lib/shortlist-ranking";
import {
  ninetyNineCoUrl,
  propertyGuruUrl,
  srxUrl,
} from "@/lib/listingPortalLinks";
import { getDataConfidenceLabelKey } from "@/lib/confidence";
import {
  buildShortlistComparisonRows,
  type ShortlistComparisonRow,
} from "@/lib/shortlist-comparison";
import { encodeShortlistForUrl } from "@/lib/shortlist";
import { buildShortlistShareUrl } from "@/lib/shareUrls";
import { buildShortlistCsvContent } from "@/lib/export";
import { ShareButton } from "@/components/ShareButton";
import { buildLeaseSignals } from "@/lib/leaseSignals";
import { LeaseWarningPanel } from "@/components/LeaseWarningPanel";
import { ShortlistSyncSection } from "@/components/ShortlistSyncSection";
import { MrtLineDots } from "@/components/MrtLineDots";
import { BudgetMatchBadge } from "@/components/BudgetMatchBadge";
import { BuyerChecklist } from "@/components/BuyerChecklist";
import { useChecklist } from "@/hooks/useChecklist";
import type { ChecklistItemId } from "@/lib/checklist";
import type {
  AddressDetailSummary,
  AddressTrendPoint,
  BlockSummary,
  ComparisonArtifact,
  FilterState,
  ShortlistItem,
} from "@/types/data";
import type { ShortlistSync } from "@/hooks/useShortlist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type ShortlistRow = {
  item: ShortlistItem;
  block: BlockSummary;
  detailSummary: AddressDetailSummary | null;
  monthlyTrend: AddressTrendPoint[];
  comparison: ComparisonArtifact | null;
};

type ShortlistViewMode = "list" | "compare";

type ShortlistDrawerProps = {
  isOpen: boolean;
  rows: ShortlistRow[];
  filters: FilterState;
  remainingLeaseMin: number | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  onToggleOpen: () => void;
  onRemove: (addressKey: string) => void;
  onUpdate: (addressKey: string, patch: Partial<ShortlistItem>) => void;
  onSelectAddress: (addressKey: string) => void;
  sync?: ShortlistSync;
};

type GapInfo = {
  amount: number;
  labelKey:
    | "shortlist.gap.belowTarget"
    | "shortlist.gap.aboveTarget"
    | "shortlist.compare.gapMatch";
  compactLabelKey:
    | "shortlist.gap.belowTargetCompact"
    | "shortlist.gap.aboveTargetCompact"
    | "shortlist.compare.gapMatch";
  tone: "positive" | "negative" | "match";
};

const compareModeLabels: Record<CompareMode, string> = {
  "target-gap": "shortlist.compare.targetFit",
  median: "shortlist.compare.priceLow",
  "median-asc": "shortlist.compare.priceLow",
  "median-desc": "shortlist.compare.priceHigh",
  lease: "shortlist.compare.lease",
  mrt: "shortlist.compare.mrt",
};

function ShortlistComparisonTable({
  comparisonRows,
  onSelectAddress,
  budgetMin,
  budgetMax,
}: {
  comparisonRows: ShortlistComparisonRow[];
  onSelectAddress: (addressKey: string) => void;
  budgetMin?: number | null;
  budgetMax?: number | null;
}) {
  const { locale, t } = useI18n();

  const formatGap = (gap: ShortlistComparisonRow["targetGap"]) => {
    if (gap === null) {
      return null;
    }

    if (gap.tone === "match") {
      return { text: t("shortlist.compare.gapMatch"), tone: "match" as const };
    }

    const value = formatCompactCurrency(gap.amount, locale);
    const text =
      gap.tone === "below"
        ? t("shortlist.compare.gapBelow", { value })
        : t("shortlist.compare.gapAbove", { value });
    return { text, tone: gap.tone };
  };

  return (
    <div
      className="rounded-xl border border-border/40 bg-card/50 overflow-x-auto v2-scrollbar"
      data-testid="shortlist-comparison-table"
    >
      <Table
        aria-label={t("shortlist.compare.tableLabel")}
        className="min-w-[48rem] text-xs"
      >
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="h-9 w-8 px-2 text-right">
              {t("shortlist.compare.col.rank")}
            </TableHead>
            <TableHead className="h-9 px-2">
              {t("shortlist.compare.col.address")}
            </TableHead>
            <TableHead className="h-9 px-2">
              {t("shortlist.compare.col.town")}
            </TableHead>
            <TableHead className="h-9 px-2 text-right">
              {t("shortlist.compare.col.medianPrice")}
            </TableHead>
            <TableHead className="h-9 px-2 text-right">
              {t("shortlist.compare.col.medianPerSqm")}
            </TableHead>
            <TableHead className="h-9 px-2 text-right">
              {t("shortlist.compare.col.txns")}
            </TableHead>
            <TableHead className="h-9 px-2">
              {t("shortlist.compare.col.lease")}
            </TableHead>
            <TableHead className="h-9 px-2">
              {t("shortlist.compare.col.mrt")}
            </TableHead>
            <TableHead className="h-9 px-2 text-right">
              {t("shortlist.compare.col.targetPrice")}
            </TableHead>
            <TableHead className="h-9 min-w-[10rem] whitespace-normal px-2">
              {t("shortlist.compare.col.notes")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparisonRows.map((row, index) => {
            const gap = formatGap(row.targetGap);
            return (
              <TableRow
                key={row.addressKey}
                data-testid="shortlist-comparison-row"
              >
                <TableCell className="px-2 py-2 text-right font-extrabold tabular-nums text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell className="px-2 py-2">
                  <button
                    type="button"
                    className="block rounded-sm text-left font-extrabold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    onClick={() => onSelectAddress(row.addressKey)}
                    aria-label={t("shortlist.compare.viewBlock", { address: row.address })}
                  >
                    {row.address}
                  </button>
                  {row.flatTypeLabel ? (
                    <span className="block text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      {row.flatTypeLabel}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-2 py-2 font-medium text-muted-foreground">
                  {localizeTownName(row.town, locale)}
                </TableCell>
                <TableCell className="px-2 py-2 text-right">
                  <span className="block font-extrabold tabular-nums text-foreground">
                    {formatCompactCurrency(row.medianPrice, locale)}
                  </span>
                  <BudgetMatchBadge
                    medianPrice={row.medianPrice}
                    budgetMin={budgetMin ?? null}
                    budgetMax={budgetMax ?? null}
                    t={t}
                    locale={locale}
                    variant="compact"
                    className="block text-[0.6rem] font-bold tabular-nums"
                  />
                  {gap ? (
                    <span
                      className={cn(
                        "block text-[0.6rem] font-bold tabular-nums",
                        gap.tone === "below" && "text-success",
                        gap.tone === "above" && "text-destructive",
                        gap.tone === "match" && "text-primary",
                      )}
                    >
                      {gap.text}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">
                  {row.medianPricePerSqm !== null
                    ? formatCurrency(Math.round(row.medianPricePerSqm), locale)
                    : t("shortlist.compare.cellEmpty")}
                </TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">
                  {formatNumber(row.recentTransactionCount, 0, locale)}
                </TableCell>
                <TableCell className="px-2 py-2 tabular-nums">
                  {formatRemainingLease(row.leaseCommenceRange, t)}
                </TableCell>
                <TableCell className="px-2 py-2">
                  {row.nearestMrt ? (
                    <>
                      <span className="block font-semibold text-foreground">
                        {row.nearestMrt.stationName}
                      </span>
                      <span
                        className="block text-[0.6rem] font-bold tabular-nums text-muted-foreground"
                        title={formatMeters(row.nearestMrt.distanceMeters, t, locale)}
                        aria-label={`${formatMinutesWalk(row.nearestMrt.walkingTimeSeconds, t, locale)} (${formatMeters(row.nearestMrt.distanceMeters, t, locale)})`}
                      >
                        {formatMinutesWalk(row.nearestMrt.walkingTimeSeconds, t, locale)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("shortlist.compare.cellEmpty")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">
                  {row.targetPrice !== null
                    ? formatCompactCurrency(row.targetPrice, locale)
                    : t("shortlist.compare.cellEmpty")}
                </TableCell>
                <TableCell className="min-w-[10rem] whitespace-normal px-2 py-2 text-muted-foreground">
                  {row.notes.trim().length > 0
                    ? row.notes
                    : t("shortlist.compare.cellEmpty")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function getGapInfo(targetPrice: number | null, medianPrice: number): GapInfo | null {
  if (targetPrice === null) {
    return null;
  }

  const amount = Math.abs(targetPrice - medianPrice);

  if (targetPrice === medianPrice) {
    return {
      amount,
      labelKey: "shortlist.compare.gapMatch",
      compactLabelKey: "shortlist.compare.gapMatch",
      tone: "match",
    };
  }

  if (targetPrice > medianPrice) {
    return {
      amount,
      labelKey: "shortlist.gap.belowTarget",
      compactLabelKey: "shortlist.gap.belowTargetCompact",
      tone: "positive",
    };
  }

  return {
    amount,
    labelKey: "shortlist.gap.aboveTarget",
    compactLabelKey: "shortlist.gap.aboveTargetCompact",
    tone: "negative",
  };
}

function getLeaseYears(row: ShortlistRow) {
  return Math.max(0, MAX_LEASE_DURATION - (getCurrentYear() - row.block.leaseCommenceRange[1]));
}

function MiniSpark({
  color,
  points,
}: {
  color: string;
  points: AddressTrendPoint[];
}) {
  const values: number[] = [];
  let min = Infinity;
  let max = -Infinity;

  const startIndex = Math.max(0, points.length - 12);
  for (let i = startIndex; i < points.length; i++) {
    const price = points[i].medianPrice;
    if (price != null && !Number.isNaN(price)) {
      values.push(price);
      if (price < min) min = price;
      if (price > max) max = price;
    }
  }

  if (values.length < 2) {
    return <span className="h-[18px] w-16 rounded-sm bg-muted/60" aria-hidden="true" />;
  }

  const range = max - min || 1;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 64;
      const y = 18 - ((value - min) / range) * 16 - 1;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg aria-hidden="true" className="h-[18px] w-16 shrink-0" viewBox="0 0 64 18">
      <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function PercentileBar({
  invert = false,
  label,
  value,
}: {
  invert?: boolean;
  label: string;
  value: number;
}) {
  const rounded = Math.round(value);
  const isGood = invert ? rounded >= 75 : rounded <= 25;
  const isMid = invert ? rounded >= 25 : rounded <= 75;

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            isGood ? "bg-success" : isMid ? "bg-primary" : "bg-destructive",
          )}
          style={{ width: `${Math.max(0, Math.min(100, rounded))}%` }}
        />
      </div>
      <span className="w-9 text-right text-[0.62rem] font-bold text-muted-foreground v2-tabular">
        {rounded}%
      </span>
    </div>
  );
}

function AmenityTile({
  count,
  icon: Icon,
  label,
  note,
}: {
  count: number;
  icon: React.ElementType;
  label: string;
  note?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5">
        <Icon data-icon className="size-3.5 text-primary" aria-hidden="true" />
        <strong className="text-xs font-extrabold tracking-tight">{count}</strong>
      </div>
      <div className="mt-1 text-[0.55rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      {note ? <div className="mt-1 line-clamp-1 text-[0.62rem] italic text-muted-foreground">{note}</div> : null}
    </div>
  );
}

function CurrencyEditor({
  id,
  label,
  value,
  placeholder,
  onChange,
  t,
}: {
  id: string;
  label: string;
  value: number | null;
  placeholder: string;
  onChange: (value: number | null) => void;
  t: Translator;
}) {
  const handleChange = useCallback(
    (val: string) => {
      const parsed = val === "" ? null : Number(val);
      onChange(Number.isFinite(parsed) ? parsed : null);
    },
    [onChange],
  );
  const ime = useIMEComposition(handleChange);

  return (
    <Field>
      <FieldContent>
        <FieldLabel htmlFor={id} className="v2-section-title">
          {label}
        </FieldLabel>
        <InputGroup className="rounded-lg border border-border/40 bg-muted/10">
          <InputGroupAddon align="inline-start" className="px-2.5">
            <InputGroupText className="text-[0.65rem] font-extrabold">
              {t("shortlist.currencyCode")}
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            inputMode="numeric"
            placeholder={placeholder}
            type="number"
            value={ime.localValue ?? (value ?? "")}
            className="text-sm font-bold"
            onCompositionStart={ime.onCompositionStart}
            onCompositionEnd={ime.onCompositionEnd}
            onChange={ime.onChange}
          />
        </InputGroup>
      </FieldContent>
    </Field>
  );
}

function NotesEditor({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const ime = useIMEComposition(onChange);
  return (
    <Field>
      <FieldContent>
        <FieldLabel htmlFor={id} className="v2-section-title">
          {label}
        </FieldLabel>
        <Textarea
          id={id}
          value={ime.localValue ?? value}
          placeholder={placeholder}
          className="min-h-14 rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-sm"
          onCompositionStart={ime.onCompositionStart}
          onCompositionEnd={ime.onCompositionEnd}
          onChange={ime.onChange}
        />
      </FieldContent>
    </Field>
  );
}

function ShortlistRowEditor({
  item,
  gapInfo,
  onUpdate,
  checkedItems,
  onToggleChecklist,
}: {
  item: ShortlistItem;
  gapInfo: GapInfo | null;
  onUpdate: (addressKey: string, patch: Partial<ShortlistItem>) => void;
  checkedItems: ChecklistItemId[];
  onToggleChecklist: (addressKey: string, itemId: ChecklistItemId) => void;
}) {
  const { locale, t } = useI18n();

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <CurrencyEditor
          id={`target-${item.addressKey}`}
          label={t("shortlist.yourTargetPrice")}
          value={item.targetPrice}
          placeholder={t("shortlist.targetPricePlaceholder")}
          onChange={(val) => onUpdate(item.addressKey, { targetPrice: val })}
          t={t}
        />

        <div className="flex flex-col gap-1.5">
          <span className="v2-section-title">{t("shortlist.gapVsTarget")}</span>
          {gapInfo ? (
            <>
              <strong
                className={cn(
                  "text-sm font-extrabold tracking-tight",
                  gapInfo.tone === "positive" && "text-success",
                  gapInfo.tone === "negative" && "text-destructive",
                  gapInfo.tone === "match" && "text-primary",
                )}
              >
                {gapInfo.tone === "match"
                  ? t(gapInfo.labelKey)
                  : formatCurrency(gapInfo.amount, locale)}
              </strong>
              {gapInfo.tone !== "match" ? (
                <span className="text-[0.65rem] font-medium text-muted-foreground">
                  {t(gapInfo.labelKey)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[0.65rem] font-medium text-muted-foreground">
              {t("shortlist.enterTargetToCompare")}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CurrencyEditor
          id={`offer-${item.addressKey}`}
          label={t("shortlist.offerCeiling")}
          value={item.offerCeiling ?? null}
          placeholder={t("shortlist.offerCeilingPlaceholder")}
          onChange={(val) => onUpdate(item.addressKey, { offerCeiling: val ?? undefined })}
          t={t}
        />
        <NotesEditor
          id={`agent-${item.addressKey}`}
          label={t("shortlist.agentRemarks")}
          value={item.agentRemarks ?? ""}
          placeholder={t("shortlist.agentRemarksPlaceholder")}
          onChange={(val) => onUpdate(item.addressKey, { agentRemarks: val })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <NotesEditor
          id={`pros-${item.addressKey}`}
          label={t("shortlist.pros")}
          value={item.pros ?? ""}
          placeholder={t("shortlist.prosPlaceholder")}
          onChange={(val) => onUpdate(item.addressKey, { pros: val })}
        />
        <NotesEditor
          id={`cons-${item.addressKey}`}
          label={t("shortlist.cons")}
          value={item.cons ?? ""}
          placeholder={t("shortlist.consPlaceholder")}
          onChange={(val) => onUpdate(item.addressKey, { cons: val })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <NotesEditor
          id={`reno-${item.addressKey}`}
          label={t("shortlist.renovation")}
          value={item.renovation ?? ""}
          placeholder={t("shortlist.renovationPlaceholder")}
          onChange={(val) => onUpdate(item.addressKey, { renovation: val })}
        />
        <NotesEditor
          id={`noise-${item.addressKey}`}
          label={t("shortlist.noise")}
          value={item.noise ?? ""}
          placeholder={t("shortlist.noisePlaceholder")}
          onChange={(val) => onUpdate(item.addressKey, { noise: val })}
        />
        <NotesEditor
          id={`transport-${item.addressKey}`}
          label={t("shortlist.transport")}
          value={item.transport ?? ""}
          placeholder={t("shortlist.transportPlaceholder")}
          onChange={(val) => onUpdate(item.addressKey, { transport: val })}
        />
      </div>

      <BuyerChecklist
        addressKey={item.addressKey}
        checkedItems={checkedItems}
        onToggle={onToggleChecklist}
        t={t}
      />

      <NotesEditor
        id={`notes-${item.addressKey}`}
        label={t("shortlist.notes")}
        value={item.notes}
        placeholder={t("shortlist.notesPlaceholder")}
        onChange={(val) => onUpdate(item.addressKey, { notes: val })}
      />
    </>
  );
}

export function ShortlistDrawer({
  isOpen,
  rows,
  filters,
  remainingLeaseMin,
  budgetMin = null,
  budgetMax = null,
  onToggleOpen,
  onRemove,
  onUpdate,
  onSelectAddress,
  sync,
}: ShortlistDrawerProps) {
  const { isDark } = useTheme();
  const { locale, t } = useI18n();
  const { state: checklistState, toggle: toggleChecklist } = useChecklist();
  const [compareMode, setCompareMode] = useState<CompareMode>("target-gap");
  const [viewMode, setViewMode] = useState<ShortlistViewMode>("list");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(rows[0]?.item.addressKey ?? null);
  const [prevRowsCount, setPrevRowsCount] = useState(rows.length);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const sortLabelId = useId();

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen && shareError !== null) setShareError(null);
  }

  const currentYear = getCurrentYear();
  const rankedRows = useMemo(() => rankShortlistRows(rows, compareMode), [rows, compareMode]);
  const leaseSignalsByAddressKey = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.item.addressKey,
          buildLeaseSignals(row.block.leaseCommenceRange, currentYear, remainingLeaseMin),
        ]),
      ),
    [currentYear, remainingLeaseMin, rows],
  );
  const comparisonViewRows = useMemo(
    () => buildShortlistComparisonRows(rankedRows),
    [rankedRows],
  );

  const effectiveExpandedKey =
    expandedKey === null
      ? null
      : rows.some((row) => row.item.addressKey === expandedKey)
        ? expandedKey
        : rows[0]?.item.addressKey ?? null;

  // Adjust expandedKey when rows change (e.g. handle first item added or expanded item removed)
  if (rows.length !== prevRowsCount) {
    setPrevRowsCount(rows.length);
    if (shareError !== null) setShareError(null);
    if (prevRowsCount === 0 && rows.length > 0 && expandedKey === null) {
      // If we just added the first item and nothing is expanded, expand it for the cockpit experience
      setExpandedKey(rows[0].item.addressKey);
    } else if (expandedKey !== null && !rows.some((row) => row.item.addressKey === expandedKey)) {
      // If the currently expanded item was removed, clear the stale key
      setExpandedKey(rows[0]?.item.addressKey ?? null);
    }
  }

  const showCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  function getRankingMetricLabel(row: ShortlistRow) {
    if (compareMode === "target-gap") {
      if (row.item.targetPrice === null) {
        return t("shortlist.compare.metric.targetFit.noTarget");
      }
      return t("shortlist.compare.metric.targetFit.value", {
        value: formatCurrency(Math.abs(row.item.targetPrice - row.block.medianPrice), locale),
      });
    }

    if (compareMode === "median" || compareMode === "median-asc" || compareMode === "median-desc") {
      return t("shortlist.compare.metric.price.value", {
        value: formatCurrency(row.block.medianPrice, locale),
      });
    }

    if (compareMode === "lease") {
      return t("shortlist.compare.metric.lease.value", {
        value: getLeaseYears(row),
      });
    }

    if (row.block.nearestMrt) {
      return t("shortlist.compare.metric.mrt.value", {
        value: formatMinutesWalk(row.block.nearestMrt.walkingTimeSeconds, t, locale),
      });
    }

    return t("shortlist.compare.metric.mrt.missing");
  }

  const shortlistShareUrl = useMemo(() => {
    const encoded = encodeShortlistForUrl(rows.map((row) => row.item));
    if (!encoded) {
      return "";
    }
    return buildShortlistShareUrl(
      encoded,
      filters,
      window.location.origin,
      window.location.pathname,
    );
  }, [filters, rows]);

  const shortlistShareBlocked = shortlistShareUrl === "";

  const shortlistCsvExport = useMemo(
    () => ({
      filename: "hdb-shortlist.csv",
      getContent: () =>
        buildShortlistCsvContent(
          [
            t("shortlist.export.address"),
            t("shortlist.export.medianPrice"),
            t("shortlist.export.targetPrice"),
            t("shortlist.export.schools1km"),
            t("shortlist.export.hawkers1km"),
            t("shortlist.export.supermarkets1km"),
            t("shortlist.export.parks1km"),
            t("shortlist.export.mrtDistance"),
            t("shortlist.export.notes"),
          ],
          rankedRows.map((row) => ({
            address: `${row.block.block} ${row.block.streetName}`,
            medianPrice: row.block.medianPrice,
            targetPrice: row.item.targetPrice,
            schools1km: row.comparison?.amenities.primarySchoolsWithin1km ?? "",
            hawkers1km: row.comparison?.amenities.hawkerCentresWithin1km ?? "",
            supermarkets1km: row.comparison?.amenities.supermarketsWithin1km ?? "",
            parks1km: row.comparison?.amenities.parksWithin1km ?? "",
            mrtDistanceMeters: row.block.nearestMrt?.distanceMeters ?? "",
            notes: row.item.notes || "",
          })),
        ),
    }),
    [rankedRows, t],
  );

  function handleCopySummary() {
    const header = `| Address | Median Price | Target Price | Lease | MRT | Schools (1km) | Hawkers (1km) |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`;
    const body = rows
      .map((row) => {
        const address = `${row.block.block} ${row.block.streetName}`;
        const median = formatCurrency(row.block.medianPrice, locale);
        const target =
          row.item.targetPrice !== null ? formatCurrency(row.item.targetPrice, locale) : "-";
        const lease = formatRemainingLease(row.block.leaseCommenceRange, t);
        const mrt = row.block.nearestMrt
          ? formatMinutesWalk(row.block.nearestMrt.walkingTimeSeconds, t, locale)
          : "-";
        const schools = row.comparison?.amenities.primarySchoolsWithin1km ?? "-";
        const hawkers = row.comparison?.amenities.hawkerCentresWithin1km ?? "-";
        return `| ${address} | ${median} | ${target} | ${lease} | ${mrt} | ${schools} | ${hawkers} |`;
      })
      .join("\n");

    navigator.clipboard?.writeText(`${header}\n${body}`)?.then(
      () => showCopied("summary"),
      () => {},
    );
  }

  function handleExportJson() {
    const blob = new Blob([JSON.stringify(rankedRows.map((row) => row.item), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hdb-shortlist.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const highlights = useMemo(() => {
    let bestValueRow: typeof rows[0] | null = null;
    let longestLeaseRow: typeof rows[0] | null = null;
    let closestMrtRow: typeof rows[0] | null = null;

    let minPrice = Number.POSITIVE_INFINITY;
    let maxLease = Number.NEGATIVE_INFINITY;
    let minMrtDistance = Number.POSITIVE_INFINITY;

    for (const row of rows) {
      const price = row.block.medianPrice;
      if (!bestValueRow || price < minPrice) {
        bestValueRow = row;
        minPrice = price;
      }

      const lease = row.block.leaseCommenceRange[1];
      if (!longestLeaseRow || lease > maxLease) {
        longestLeaseRow = row;
        maxLease = lease;
      }

      const distance = row.block.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
      if (!closestMrtRow || distance < minMrtDistance) {
        closestMrtRow = row;
        minMrtDistance = distance;
      }
    }

    return [
      {
        label: t("shortlist.bestValue"),
        row: bestValueRow,
        sub: bestValueRow ? formatCompactCurrency(bestValueRow.block.medianPrice, locale) : t("shortlist.na"),
      },
      {
        label: t("shortlist.highlights.longestLease"),
        row: longestLeaseRow,
        sub: longestLeaseRow ? t("unit.years", { value: getLeaseYears(longestLeaseRow) }) : t("shortlist.na"),
      },
      {
        label: t("shortlist.closestMrt"),
        row: closestMrtRow,
        sub: closestMrtRow?.block.nearestMrt
          ? formatMinutesWalk(closestMrtRow.block.nearestMrt.walkingTimeSeconds, t, locale)
          : t("shortlist.na"),
      },
    ];
  }, [locale, rows, t]);

  const trendChartRows = useMemo(() => rows.filter((row) => row.monthlyTrend.length > 0), [rows]);
  const compareChart = useMemo(() => {
    if (trendChartRows.length < 2) {
      return null;
    }

    const months = [...new Set(trendChartRows.flatMap((row) => row.monthlyTrend.map((point) => point.month)))].sort(
      (left, right) => left.localeCompare(right),
    );
    const seriesKeys = trendChartRows.map((row) => `${row.block.block} ${row.block.streetName}`);
    const priceMaps = trendChartRows.map((row) =>
      new Map(row.monthlyTrend.map((point) => [point.month, point.medianPrice])),
    );
    let maxPrice = 0;
    const data = months.map((month) => {
      const row: Record<string, string | number | undefined> = { month };
      for (let i = 0; i < seriesKeys.length; i++) {
        const price = priceMaps[i].get(month);
        if (price != null && !Number.isNaN(price)) {
          row[seriesKeys[i]] = price;
          if (price > maxPrice) maxPrice = price;
        } else {
          row[seriesKeys[i]] = undefined;
        }
      }
      return row;
    });
    const priceAxisWidth = maxPrice > 0
      ? Math.max(48, formatCompactCurrency(maxPrice).length * 8 + 4)
      : 48;

    const palette = isDark
      ? ["#79a6ff", "#7ecb63", "#ffb86c", "#ff79c6"]
      : [PRIMARY_BLUE, "#3a8a6f", "#d97706", "#c026d3"];

    const colors = {
      popover: isDark ? "#191f1d" : "#ffffff",
      popoverForeground: isDark ? "#e4e7e4" : "#171c1f",
      border: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
      splitLine: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)",
      mutedForeground: isDark ? "#9baaa4" : "#6b7572",
    };

    return { data, seriesKeys, palette, colors, priceAxisWidth };
  }, [trendChartRows, isDark]);

  return (
    <section data-testid="shortlist-drawer" className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col gap-0 border-none bg-transparent py-0 shadow-none">
        <CardHeader className="shrink-0 gap-3 border-b border-border/40 bg-background/90 px-3 py-3 backdrop-blur-xl sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="mr-auto min-w-0">
              <div className="v2-kicker">{t("shortlist.savedProperties")}</div>
              <CardTitle className="mt-1 flex min-w-0 items-center gap-2 text-lg font-extrabold normal-case leading-none tracking-tight">
                <span className="truncate">{t("shortlist.title")}</span>
                <Badge className="h-5 shrink-0 px-1.5 text-[0.62rem] font-extrabold">
                  {rows.length}
                </Badge>
              </CardTitle>
            </div>
            <Button
              onClick={onToggleOpen}
              size="icon-xs"
              variant="outline"
              type="button"
              className="rounded-lg border-border/50 bg-card/80"
              aria-expanded={isOpen}
              aria-controls="shortlist-content"
              aria-label={isOpen ? t("shortlist.collapse") : t("shortlist.expand")}
              title={isOpen ? t("shortlist.collapse") : t("shortlist.expand")}
            >
              <ChevronDown
                data-icon
                className={cn("size-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")}
                aria-hidden="true"
              />
            </Button>
          </div>

          {rows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <ButtonGroup
                aria-label={t("shortlist.view.label")}
                className="w-fit gap-0 rounded-lg border border-border/50 bg-card/80 p-0.5"
                data-testid="shortlist-view-toggle"
              >
                <Button
                  type="button"
                  size="xs"
                  variant={viewMode === "list" ? "default" : "ghost"}
                  aria-pressed={viewMode === "list"}
                  aria-label={t("shortlist.view.listAria")}
                  onClick={() => setViewMode("list")}
                  className="h-7 rounded-md px-2.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em]"
                >
                  <LayoutGrid data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                  {t("shortlist.view.list")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={viewMode === "compare" ? "default" : "ghost"}
                  aria-pressed={viewMode === "compare"}
                  aria-label={t("shortlist.view.compareAria")}
                  onClick={() => setViewMode("compare")}
                  className="h-7 rounded-md px-2.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em]"
                >
                  <TableIcon data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                  {t("shortlist.view.compare")}
                </Button>
              </ButtonGroup>
              <div className="flex min-w-0 items-center gap-2">
                <Field className="min-w-0 flex-1 flex-row items-center gap-2 space-y-0">
                  <FieldLabel id={sortLabelId} className="sr-only">
                    {t("shortlist.sortBy")}
                  </FieldLabel>
                  <Select
                    value={compareMode}
                    onValueChange={(value) => setCompareMode(value as CompareMode)}
                  >
                    <SelectTrigger
                      aria-labelledby={sortLabelId}
                      className="h-8 min-w-0 rounded-lg border-border/50 bg-card/80 px-2 text-[0.65rem] font-extrabold uppercase tracking-[0.08em]"
                    >
                      <ArrowUpDown data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="target-gap">{t(compareModeLabels["target-gap"])}</SelectItem>
                        <SelectItem value="median-asc">{t(compareModeLabels["median-asc"])}</SelectItem>
                        <SelectItem value="median-desc">{t(compareModeLabels["median-desc"])}</SelectItem>
                        <SelectItem value="lease">{t(compareModeLabels.lease)}</SelectItem>
                        <SelectItem value="mrt">{t(compareModeLabels.mrt)}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <ShareButton
                  url={shortlistShareUrl || window.location.href}
                  title={t("app.title")}
                  ariaLabel={t("shortlist.shareLinkLabel")}
                  ariaLabelCopied={t("shortlist.shareCopied")}
                  errorLabel={t("share.copyError")}
                  shareDisabled={shortlistShareBlocked}
                  onShareBlocked={() => setShareError(t("shortlist.shareErrorTooLarge"))}
                  csvExport={shortlistCsvExport}
                  exportAriaLabel={t("shortlist.export.csvLabel")}
                  exportAriaLabelDone={t("share.exportCsvDone")}
                  className="rounded-lg border-border/50 bg-card/80"
                  size="icon-xs"
                  variant="outline"
                />
              </div>

              {shareError && (
                <div role="alert" className="rounded-lg bg-destructive/10 px-2 py-1.5 text-[0.65rem] font-medium text-destructive">
                  {shareError}
                </div>
              )}

              <div className="min-w-0 overflow-x-auto v2-scrollbar">
                <ButtonGroup className="w-max flex-nowrap gap-1.5 [&>*]:rounded-lg [&>*]:border-border/50 [&>*]:bg-card/80">
                  <Button variant="outline" size="xs" onClick={handleExportJson} type="button">
                    <Download data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                    {t("shortlist.export.json")}
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleCopySummary}
                    type="button"
                    className={copiedKey === "summary" ? "text-primary" : undefined}
                  >
                    {copiedKey === "summary" ? (
                      <Check data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Copy data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                    )}
                    {copiedKey === "summary" ? t("shortlist.summaryCopiedShort") : t("shortlist.copySummary")}
                  </Button>
                </ButtonGroup>
              </div>
            </div>
          ) : null}
        </CardHeader>

        {isOpen ? (
          <CardContent
            id="shortlist-content"
            className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4"
          >
            {sync ? (
              <div className="mb-3 shrink-0">
                <ShortlistSyncSection sync={sync} />
              </div>
            ) : null}
            {rows.length === 0 ? (
              <div className="empty-state pt-12 text-center text-sm text-muted-foreground">
                {t("shortlist.emptyState", { count: MAX_SHORTLIST_ITEMS })}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 v2-scrollbar">
                <div className="flex flex-col gap-3 pb-8">
                  <div className="grid overflow-hidden rounded-xl border border-border/40 bg-border/50 sm:grid-cols-3">
                    {highlights.map((highlight) => (
                      <div key={highlight.label} className="min-w-0 bg-muted/35 p-3">
                        <div className="v2-kicker">{highlight.label}</div>
                        <strong className="mt-1 block truncate text-xs font-extrabold tracking-tight">
                          {highlight.row
                            ? `${highlight.row.block.block} ${highlight.row.block.streetName}`
                            : t("shortlist.na")}
                        </strong>
                        <span className="mt-0.5 block text-[0.66rem] font-extrabold text-primary">
                          {highlight.sub}
                        </span>
                      </div>
                    ))}
                  </div>

                  {viewMode === "list" && compareChart ? (
                    <Card size="sm" className="v2-card gap-3 rounded-xl py-3 shadow-none">
                      <CardHeader className="px-3">
                        <CardTitle className="v2-section-title">
                          {t("shortlist.compareTrendsTitle")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-3">
                        <div
                          style={{ height: 220, width: "100%" }}
                          aria-label={t("shortlist.compareTrendsTitle")}
                          role="img"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsLineChart data={compareChart.data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                              <XAxis
                                dataKey="month"
                                tickFormatter={(v: string) => v.slice(2)}
                                tick={{ fill: compareChart.colors.mutedForeground, fontSize: 10 }}
                                axisLine={{ stroke: compareChart.colors.border }}
                                tickLine={false}
                              />
                              <YAxis
                                tickFormatter={(v: number) => formatCompactCurrency(v)}
                                tick={{ fill: compareChart.colors.mutedForeground, fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                width={compareChart.priceAxisWidth}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: compareChart.colors.popover,
                                  border: `1px solid ${compareChart.colors.border}`,
                                  color: compareChart.colors.popoverForeground,
                                  borderRadius: 4,
                                  fontSize: 11,
                                }}
                                labelFormatter={(label) => String(label)}
                                formatter={(value) => {
                                  if (value == null || typeof value !== "number" || Number.isNaN(value)) {
                                    return t("shortlist.na");
                                  }
                                  return formatCompactCurrency(value);
                                }}
                              />
                              <Legend
                                verticalAlign="top"
                                wrapperStyle={{ fontSize: 10, fontWeight: 700, color: compareChart.colors.mutedForeground }}
                              />
                              {compareChart.seriesKeys.map((key, i) => (
                                <Line
                                  key={key}
                                  type="monotone"
                                  dataKey={key}
                                  stroke={compareChart.palette[i % compareChart.palette.length]}
                                  strokeWidth={2.25}
                                  dot={false}
                                  activeDot={false}
                                  connectNulls={false}
                                  isAnimationActive={true}
                                  animationDuration={400}
                                />
                              ))}
                            </RechartsLineChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {viewMode === "compare" ? (
                    <ShortlistComparisonTable
                      comparisonRows={comparisonViewRows}
                      onSelectAddress={onSelectAddress}
                      budgetMin={budgetMin}
                      budgetMax={budgetMax}
                    />
                  ) : null}

                  {viewMode === "list" ? (
                  <div className="flex flex-col gap-3" role="list">
                    {rankedRows.map((row, index) => {
                      const gapInfo = getGapInfo(row.item.targetPrice, row.block.medianPrice);
                      const isExpanded = effectiveExpandedKey === row.item.addressKey;
                      const accentColor =
                        index % 4 === 0
                          ? "var(--primary)"
                          : index % 4 === 1
                            ? "var(--success)"
                            : index % 4 === 2
                              ? "#d97706"
                              : "#c026d3";
                      const nearestSchool = row.comparison?.amenities.nearestPrimarySchools?.[0];

                      return (
                        <Card
                          key={row.item.addressKey}
                          role="listitem"
                          data-state={isExpanded ? "expanded" : "collapsed"}
                          className={cn(
                            "v2-card ss-fade-in gap-0 rounded-xl py-0 transition-all cv-auto",
                            isExpanded && "shadow-[0_12px_32px_rgba(23,28,31,0.10)]",
                          )}
                        >
                          <CardHeader className="gap-0 px-0">
                            <div className="flex items-start gap-2 p-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedKey((current) =>
                                    current === row.item.addressKey ? null : row.item.addressKey,
                                  )
                                }
                                className="flex min-w-0 flex-1 flex-col text-left"
                                aria-expanded={isExpanded}
                              >
                                <div className="flex min-w-0 items-start gap-2">
                                  <span
                                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white"
                                    style={{ backgroundColor: accentColor }}
                                  >
                                    {index + 1}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <strong className="block truncate text-sm font-extrabold leading-tight tracking-tight">
                                      {row.block.block} {row.block.streetName}
                                    </strong>
                                    <span className="block truncate text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                                      {localizeTownName(row.block.town, locale)}
                                      {row.block.flatTypes[0] ? ` - ${row.block.flatTypes[0]}` : ""}
                                    </span>
                                    <span className="sr-only">{getRankingMetricLabel(row)}</span>
                                  </span>
                                  <span className="shrink-0 text-right">
                                    <strong className="block text-base font-extrabold leading-tight tracking-tight v2-tabular">
                                      {formatCompactCurrency(row.block.medianPrice, locale)}
                                    </strong>
                                    <BudgetMatchBadge
                                      medianPrice={row.block.medianPrice}
                                      budgetMin={budgetMin ?? null}
                                      budgetMax={budgetMax ?? null}
                                      t={t}
                                      locale={locale}
                                      variant="compact"
                                      className="block text-[0.58rem] font-bold"
                                    />
                                    <span className="block text-[0.6rem] font-semibold text-muted-foreground">
                                      {row.detailSummary?.pricePerSqftMedian
                                        ? t("unit.psf", {
                                            value: formatNumber(row.detailSummary.pricePerSqftMedian, 0, locale),
                                          })
                                        : t("shortlist.na")}
                                    </span>
                                  </span>
                                </div>

                                <div className="mt-2 flex min-w-0 items-center gap-3 text-[0.65rem] font-semibold text-muted-foreground">
                                  <MiniSpark color={accentColor} points={row.monthlyTrend} />
                                  <span>{t("unit.years", { value: getLeaseYears(row) })}</span>
                                  {row.block.nearestMrt ? (
                                    <span
                                      title={formatMeters(row.block.nearestMrt.distanceMeters, t, locale)}
                                      aria-label={`${formatMinutesWalk(row.block.nearestMrt.walkingTimeSeconds, t, locale)} (${formatMeters(row.block.nearestMrt.distanceMeters, t, locale)})`}
                                    >
                                      {formatMinutesWalk(row.block.nearestMrt.walkingTimeSeconds, t, locale)}
                                    </span>
                                  ) : null}
                                  <span>{t("stats.txns", { count: formatNumber(row.block.transactionCount, 0, locale) })}</span>
                                  <Badge variant="outline" className="w-fit text-[0.58rem] font-bold uppercase tracking-[0.08em]">
                                    {t(getDataConfidenceLabelKey(row.block.transactionCount))}
                                  </Badge>
                                  <span
                                    className={cn(
                                      "ml-auto text-right text-[0.62rem] font-extrabold uppercase tracking-[0.08em]",
                                      gapInfo?.tone === "positive" && "text-success",
                                      gapInfo?.tone === "negative" && "text-destructive",
                                      gapInfo?.tone === "match" && "text-primary",
                                      !gapInfo && "text-muted-foreground",
                                    )}
                                  >
                                    {gapInfo
                                      ? gapInfo.tone === "match"
                                        ? t(gapInfo.compactLabelKey)
                                        : `${formatCompactCurrency(gapInfo.amount, locale)} ${t(gapInfo.compactLabelKey)}`
                                      : t("shortlist.noTargetSet")}
                                  </span>
                                </div>
                              </button>

                              <Button
                                size="icon-xs"
                                variant="ghost"
                                onClick={() => onRemove(row.item.addressKey)}
                                type="button"
                                className="rounded-lg text-muted-foreground hover:text-destructive"
                                aria-label={t("shortlist.remove")}
                                title={t("shortlist.remove")}
                              >
                                <X data-icon className="size-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </CardHeader>

                          {isExpanded ? (
                            <CardContent className="flex flex-col gap-4 border-t border-border/40 px-3 py-3">
                              {row.comparison ? (
                                <div>
                                  <div className="v2-section-title mb-2">{t("shortlist.marketPosition")}</div>
                                  <div className="flex flex-col gap-1.5">
                                    <PercentileBar
                                      label={t("detail.rank.price")}
                                      value={row.comparison.percentileRanks.pricePercentile}
                                    />
                                    <PercentileBar
                                      invert
                                      label={t("detail.rank.lease")}
                                      value={row.comparison.percentileRanks.leasePercentile}
                                    />
                                    <PercentileBar
                                      invert
                                      label={t("detail.rank.mrt")}
                                      value={row.comparison.percentileRanks.mrtDistancePercentile}
                                    />
                                    <PercentileBar
                                      invert
                                      label={t("detail.rank.liquidity")}
                                      value={row.comparison.percentileRanks.transactionCountPercentile}
                                    />
                                  </div>
                                  <div className="sr-only">
                                    <span>{t("shortlist.pricePercentile")}</span>
                                    <span>
                                      {t("shortlist.percentileValue", {
                                        value: Math.round(row.comparison.percentileRanks.pricePercentile),
                                      })}
                                    </span>
                                    <span>{t("shortlist.locationPercentiles")}</span>
                                    <span>
                                      {t("shortlist.locationPercentileValues", {
                                        mrt: Math.round(row.comparison.percentileRanks.mrtDistancePercentile),
                                        lease: Math.round(row.comparison.percentileRanks.leasePercentile),
                                      })}
                                    </span>
                                  </div>
                                </div>
                              ) : null}

                              {row.comparison ? (
                                <div>
                                  <div className="v2-section-title mb-2">
                                    {t("shortlist.nearbyAmenities1km")}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <AmenityTile
                                      icon={GraduationCap}
                                      label={t("shortlist.primarySchools")}
                                      count={row.comparison.amenities.primarySchoolsWithin1km}
                                      note={
                                        nearestSchool
                                          ? t("shortlist.nearestNamedDistance", {
                                              name: nearestSchool.name,
                                              distance: formatMeters(nearestSchool.distanceMeters, t, locale),
                                            })
                                          : null
                                      }
                                    />
                                    <AmenityTile
                                      icon={UtensilsCrossed}
                                      label={t("detail.amenity.hawkers")}
                                      count={row.comparison.amenities.hawkerCentresWithin1km}
                                    />
                                    <AmenityTile
                                      icon={ShoppingCart}
                                      label={t("detail.amenity.supermarkets")}
                                      count={row.comparison.amenities.supermarketsWithin1km}
                                    />
                                    <AmenityTile
                                      icon={Trees}
                                      label={t("detail.amenity.parks")}
                                      count={row.comparison.amenities.parksWithin1km}
                                    />
                                  </div>
                                  <div className="sr-only">
                                    <span>
                                      {t("shortlist.schoolsWithin", {
                                        count1km: row.comparison.amenities.primarySchoolsWithin1km,
                                        count2km: row.comparison.amenities.primarySchoolsWithin2km,
                                      })}
                                    </span>
                                    <span>{t("shortlist.amenities")}</span>
                                    <span>
                                      {t("shortlist.amenityCounts", {
                                        hawkers: row.comparison.amenities.hawkerCentresWithin1km,
                                        supermarkets: row.comparison.amenities.supermarketsWithin1km,
                                        parks: row.comparison.amenities.parksWithin1km,
                                      })}
                                    </span>
                                  </div>
                                </div>
                              ) : null}

                              <div>
                                <div className="v2-section-title mb-1.5">{t("shortlist.mrtConnectivity")}</div>
                                <div className="flex flex-col">
                                  {(row.block.nearbyMrts ?? (row.block.nearestMrt ? [row.block.nearestMrt] : []))
                                    .slice(0, 3)
                                    .map((mrt, idx, list) => (
                                      <div
                                        key={`${mrt.stationName}-${idx}`}
                                        className={cn(
                                          "flex items-center justify-between py-1.5",
                                          idx < list.length - 1 && "border-b border-border/30",
                                        )}
                                      >
                                        <span className="flex min-w-0 items-center gap-2">
                                          <MrtLineDots stationName={mrt.stationName} />
                                          <span className="truncate text-xs font-bold">{mrt.stationName}</span>
                                        </span>
                                        <Badge
                                          variant={idx === 0 ? "default" : "secondary"}
                                          className="h-5 shrink-0 text-[0.58rem] font-extrabold v2-tabular"
                                          title={formatMeters(mrt.distanceMeters, t, locale)}
                                          aria-label={`${formatMinutesWalk(mrt.walkingTimeSeconds, t, locale)} (${formatMeters(mrt.distanceMeters, t, locale)})`}
                                        >
                                          {formatMinutesWalk(mrt.walkingTimeSeconds, t, locale)}
                                        </Badge>
                                      </div>
                                    ))}
                                </div>
                              </div>

                              <LeaseWarningPanel
                                signals={leaseSignalsByAddressKey.get(row.item.addressKey) ?? []}
                                t={t}
                              />

                              <ShortlistRowEditor
                                item={row.item}
                                gapInfo={gapInfo}
                                onUpdate={onUpdate}
                                checkedItems={checklistState[row.item.addressKey] ?? []}
                                onToggleChecklist={toggleChecklist}
                              />

                              <ButtonGroup
                                aria-label={t("shortlist.openInPortal.group")}
                                className="w-full grid grid-cols-1 sm:grid-cols-3 gap-1.5 [&>*]:rounded-lg [&>*]:border-border/50 [&>*]:bg-card/80"
                              >
                                <Button
                                  asChild
                                  variant="outline"
                                  size="xs"
                                >
                                  <a
                                    href={propertyGuruUrl(row.block)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={t("shortlist.openInPropertyGuru")}
                                    title={t("shortlist.openInPropertyGuru")}
                                  >
                                    <ExternalLink
                                      data-icon="inline-start"
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    PropertyGuru
                                  </a>
                                </Button>
                                <Button
                                  asChild
                                  variant="outline"
                                  size="xs"
                                >
                                  <a
                                    href={ninetyNineCoUrl(row.block)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={t("shortlist.openInNinetyNineCo")}
                                    title={t("shortlist.openInNinetyNineCo")}
                                  >
                                    <ExternalLink
                                      data-icon="inline-start"
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    99.co
                                  </a>
                                </Button>
                                <Button
                                  asChild
                                  variant="outline"
                                  size="xs"
                                >
                                  <a
                                    href={srxUrl(row.block)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={t("shortlist.openInSrx")}
                                    title={t("shortlist.openInSrx")}
                                  >
                                    <ExternalLink
                                      data-icon="inline-start"
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    SRX
                                  </a>
                                </Button>
                              </ButtonGroup>

                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg border-border/50"
                                  onClick={() => onRemove(row.item.addressKey)}
                                >
                                  <X data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                                  {t("shortlist.remove")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="rounded-lg"
                                  onClick={() => onSelectAddress(row.item.addressKey)}
                                >
                                  <MapPin data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                                  {t("shortlist.viewOnMap")}
                                </Button>
                              </div>
                            </CardContent>
                          ) : null}
                        </Card>
                      );
                    })}
                  </div>
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        ) : null}
      </Card>
    </section>
  );
}
