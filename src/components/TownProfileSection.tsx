import { useMemo } from "react";
import type { BlockSummary } from "@/types/data";
import type { Translator } from "@/shared/lib/i18n/types";
import { formatCompactCurrency, formatMonth, formatNumber } from "@/shared/lib/format";
import { localizeFlatType, localizeTownName } from "@/shared/lib/i18n/domain";
import type {
  LeaseCommenceDecadeBucket,
  TownFlatTypeRollup,
  TrendMonthRange,
} from "@/entities/town/town-profile";

type TownProfileSectionProps = {
  locale: import("@/shared/lib/i18n/types").Locale;
  t: Translator;
  townName: string;
  monthRange: TrendMonthRange;
  rollups: TownFlatTypeRollup[];
  totalTrendVolume: number;
  weightedLatestSqm: number | null;
  leaseBuckets: LeaseCommenceDecadeBucket[];
  busyBlocks: BlockSummary[];
  belowMedian: { townMedian: number | null; blocks: BlockSummary[] };
  trendsLoading: boolean;
  trendsFailed: boolean;
  onSelectBlock: (addressKey: string) => void;
};

function BlockMicroRow({
  block,
  locale,
  subtitle,
  onSelect,
}: {
  block: BlockSummary;
  locale: import("@/shared/lib/i18n/types").Locale;
  subtitle: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-border/35 bg-muted/40 px-2 py-1.5 text-left text-[0.7rem] transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
    >
      <span className="min-w-0 flex-1 truncate font-semibold">
        {block.block} {block.streetName}
      </span>
      <span className="shrink-0 whitespace-nowrap text-muted-foreground">
        <span className="v2-tabular font-semibold text-foreground">
          {formatCompactCurrency(block.medianPrice, locale)}
        </span>
        {" · "}
        {subtitle}
      </span>
    </button>
  );
}

export function TownProfileSection({
  locale,
  t,
  townName,
  monthRange,
  rollups,
  totalTrendVolume,
  weightedLatestSqm,
  leaseBuckets,
  busyBlocks,
  belowMedian,
  trendsLoading,
  trendsFailed,
  onSelectBlock,
}: TownProfileSectionProps) {
  const totalLeaseBlocks = useMemo(
    () => leaseBuckets.reduce((s, b) => s + b.blockCount, 0),
    [leaseBuckets],
  );

  return (
    <section
      aria-label={t("townProfile.sectionLabel", { town: localizeTownName(townName, locale) })}
      className="mb-4 border border-border/35 bg-muted/35 p-3 sm:p-3.5"
    >
      <header className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-1">
        <h2 className="font-heading text-sm font-extrabold tracking-tight sm:text-[0.95rem]">
          {localizeTownName(townName, locale)}
        </h2>
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {formatMonth(monthRange.start, locale)} – {formatMonth(monthRange.end, locale)}
        </p>
      </header>

      <p className="mb-3 text-[0.62rem] leading-relaxed text-muted-foreground">
        {t("townProfile.factualNote")}
      </p>

      {trendsLoading ? (
        <p className="mb-3 text-[0.7rem] text-muted-foreground">{t("townProfile.loadingTrends")}</p>
      ) : null}

      {!trendsLoading && trendsFailed ? (
        <p className="mb-3 text-[0.7rem] text-destructive">{t("townProfile.trendLoadFailed")}</p>
      ) : null}

      {!trendsLoading && !trendsFailed && rollups.length === 0 ? (
        <p className="mb-3 text-[0.7rem] text-muted-foreground">{t("townProfile.noTrendRows")}</p>
      ) : null}

      {!trendsLoading && !trendsFailed && rollups.length > 0 ? (
        <>
          <div className="-mx-1 mb-3 overflow-x-auto">
            <table className="w-full min-w-[18rem] border-separate border-spacing-y-1 text-[0.65rem] sm:text-[0.68rem]">
              <thead>
                <tr className="text-left text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-1 pl-1 pr-2">{t("townProfile.flatType")}</th>
                  <th className="pb-1 pr-2">{t("townProfile.median")}</th>
                  <th className="pb-1 pr-2">{t("townProfile.medPerSqm")}</th>
                  <th className="pb-1 pr-2">{t("townProfile.volume")}</th>
                  <th className="pb-1 pr-1">{t("townProfile.latest")}</th>
                </tr>
              </thead>
              <tbody>
                {rollups.map((row) => (
                  <tr key={row.flatType}>
                    <td className="rounded-l-md bg-background px-1 py-1 font-semibold">
                      {localizeFlatType(row.flatType, locale)}
                    </td>
                    <td className="bg-background px-1 py-1 v2-tabular">
                      {row.latestMedianPrice === null
                        ? "—"
                        : formatCompactCurrency(row.latestMedianPrice, locale)}
                    </td>
                    <td className="bg-background px-1 py-1 v2-tabular">
                      {row.latestMedianPricePerSqm === null
                        ? "—"
                        : formatCompactCurrency(row.latestMedianPricePerSqm, locale)}
                    </td>
                    <td className="bg-background px-1 py-1 v2-tabular">
                      {formatNumber(row.windowTransactionVolume, 0, locale)}
                    </td>
                    <td className="rounded-r-md bg-background px-1 py-1 text-muted-foreground">
                      {row.latestMonth === null ? "—" : formatMonth(row.latestMonth, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-3 grid gap-1.5 rounded-lg border border-border/25 bg-background/60 px-2.5 py-2 text-[0.65rem]">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <span className="font-semibold text-muted-foreground">
                {t("townProfile.totalTrendVolume")}
              </span>
              <span className="v2-tabular font-extrabold">
                {formatNumber(totalTrendVolume, 0, locale)}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <span className="font-semibold text-muted-foreground">
                {t("townProfile.typicalSqm")}
              </span>
              <span className="max-w-[16rem] text-right text-[0.62rem] font-medium leading-snug">
                <span className="v2-tabular font-extrabold text-foreground">
                  {weightedLatestSqm === null
                    ? "—"
                    : formatCompactCurrency(weightedLatestSqm, locale)}
                </span>
                <span className="block text-muted-foreground">
                  {t("townProfile.typicalSqmHint")}
                </span>
              </span>
            </div>
          </div>
        </>
      ) : null}

      {leaseBuckets.length > 0 && totalLeaseBlocks > 0 ? (
        <div className="mb-3">
          <p className="mb-2 text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            {t("townProfile.leaseBucketsTitle")}
          </p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
            {leaseBuckets.map((bucket) => (
              <div
                key={bucket.decadeStart}
                className="bg-primary/70"
                style={{ width: `${(bucket.blockCount / totalLeaseBlocks) * 100}%` }}
                title={`${bucket.decadeLabel}: ${bucket.blockCount}`}
              />
            ))}
          </div>
          <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[0.62rem] sm:grid-cols-3">
            {leaseBuckets.map((bucket) => (
              <li key={bucket.decadeStart} className="flex justify-between gap-2 font-medium">
                <span className="text-muted-foreground">{bucket.decadeLabel}</span>
                <span className="v2-tabular">{bucket.blockCount}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(busyBlocks.length > 0 || belowMedian.blocks.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {busyBlocks.length > 0 ? (
            <div className="min-w-0">
              <p className="mb-1 text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {t("townProfile.busyBlocks")}
              </p>
              <div className="flex flex-col gap-1.5">
                {busyBlocks.map((block) => (
                  <BlockMicroRow
                    key={block.addressKey}
                    block={block}
                    locale={locale}
                    subtitle={t("stats.txns", {
                      count: formatNumber(block.transactionCount, 0, locale),
                    })}
                    onSelect={() => onSelectBlock(block.addressKey)}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {belowMedian.blocks.length > 0 ? (
            <div className="min-w-0">
              <p className="mb-1 text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {t("townProfile.valueBlocks")}
              </p>
              <p className="mb-1.5 text-[0.61rem] leading-snug text-muted-foreground">
                {t("townProfile.townMedianMeta", {
                  median:
                    belowMedian.townMedian === null
                      ? "—"
                      : formatCompactCurrency(belowMedian.townMedian, locale),
                })}
              </p>
              <div className="flex flex-col gap-1.5">
                {belowMedian.blocks.map((block) => (
                  <BlockMicroRow
                    key={block.addressKey}
                    block={block}
                    locale={locale}
                    subtitle={t("stats.txns", {
                      count: formatNumber(block.transactionCount, 0, locale),
                    })}
                    onSelect={() => onSelectBlock(block.addressKey)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
