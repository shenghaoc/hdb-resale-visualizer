import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { flushSync } from "react-dom";
import type { AddressDetail, BlockSummary, ComparisonArtifact, FilterState } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";
import { rankSimilarBlocks } from "@/entities/block/similar-blocks";
import { computeComparableRange } from "@/entities/transaction/comparable-range";
import { buildLeaseSignals } from "@/entities/block/leaseSignals";
import { assessLeaseFinancing, computeRemainingLeaseYears } from "@/entities/block/lease-financing";
import {
  computeBlockTrajectory,
  detectRecentTransactionOutliers,
  sliceTrendByRange,
  type RecentTransactionOutlier,
  type TrendRangeKey,
} from "@/entities/transaction/transaction-analysis";
import {
  computeAffordabilityVerdict,
  isAffordabilityProfileComplete,
} from "@/shared/lib/affordability";
import { getCurrentYear } from "@/shared/lib/constants";
import { getBlockDataQualityTag } from "@/shared/lib/listing-quality";
import { buildBlockShareUrl } from "@/shared/lib/shareUrls";
import { buildBlockExplanation } from "@/entities/block/block-explanation";
import { deriveFlatTypePriceLadder } from "@/entities/block/flat-type-ladder";
import {
  resolveEffectiveBlockCohort,
  resolveEffectiveMedianPrice,
  resolveEffectivePricePerSqmMedian,
} from "@shared/product/filtering";

export type UseBlockDetailControllerOptions = {
  selectedBlock: BlockSummary | null;
  detail: AddressDetail | null;
  comparison: ComparisonArtifact | null;
  allBlocks: readonly BlockSummary[];
  remainingLeaseMin: number | null;
  referenceMonth?: string;
  filters: FilterState;
  searchProfile: SearchProfile | null;
};

export function useBlockDetailController({
  selectedBlock,
  detail,
  comparison,
  allBlocks,
  remainingLeaseMin,
  referenceMonth,
  filters,
  searchProfile,
}: UseBlockDetailControllerOptions) {
  const [activeTab, setActiveTab] = useState("overview");
  const [isCopied, setIsCopied] = useState(false);
  const [trendRange, setTrendRange] = useState<TrendRangeKey>("5y");
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentYear = getCurrentYear();
  const currentSummary = detail?.summary ?? selectedBlock;
  const medianPriceResolution = currentSummary
    ? resolveEffectiveMedianPrice(currentSummary, filters.flatType)
    : null;
  const pricePerSqmResolution = currentSummary
    ? resolveEffectivePricePerSqmMedian(currentSummary, filters.flatType)
    : null;
  const cohortResolution = currentSummary
    ? resolveEffectiveBlockCohort(currentSummary, filters.flatType)
    : null;
  const effectiveMedianPrice = medianPriceResolution?.value ?? null;
  const effectivePricePerSqmMedian = pricePerSqmResolution?.value ?? null;

  const dataQualityTag = useMemo(
    () =>
      currentSummary
        ? getBlockDataQualityTag({
            transactionCount: cohortResolution?.transactionCount ?? currentSummary.transactionCount,
            latestMonth: cohortResolution?.latestMonth ?? currentSummary.latestMonth,
            referenceMonth,
          })
        : null,
    [
      cohortResolution?.latestMonth,
      cohortResolution?.transactionCount,
      currentSummary,
      referenceMonth,
    ],
  );

  const blockShareUrl = useMemo(() => {
    if (!currentSummary) return "";
    const shareFilters: FilterState = {
      ...filters,
      selectedAddressKey: currentSummary.addressKey,
    };
    return buildBlockShareUrl(shareFilters, `${window.location.origin}${window.location.pathname}`);
  }, [currentSummary, filters]);

  const isDrawerOpen = Boolean(currentSummary || filters.selectedAddressKey);

  const explanationCodes = useMemo(
    () =>
      currentSummary ? buildBlockExplanation({ block: currentSummary, comparison, filters }) : [],
    [comparison, currentSummary, filters],
  );

  const nearbyStations = (currentSummary?.nearbyMrts ?? []).slice(0, 3);

  const similarBlocks = useMemo(
    () =>
      selectedBlock
        ? rankSimilarBlocks(selectedBlock, allBlocks, { limit: 6, flatType: filters.flatType })
        : [],
    [allBlocks, filters.flatType, selectedBlock],
  );

  const comparableRange = useMemo(
    () =>
      selectedBlock ? computeComparableRange(selectedBlock, similarBlocks, filters.flatType) : null,
    [filters.flatType, selectedBlock, similarBlocks],
  );

  const affordabilityVerdict = useMemo(() => {
    if (!searchProfile || effectiveMedianPrice === null) return null;
    const profile = {
      monthlyIncome: searchProfile.monthlyIncome,
      cpfOABalance: searchProfile.cpfOABalance,
      age: searchProfile.age,
      coApplicantAge: searchProfile.coApplicantAge,
    };
    return isAffordabilityProfileComplete(profile)
      ? computeAffordabilityVerdict(profile, effectiveMedianPrice)
      : null;
  }, [effectiveMedianPrice, searchProfile]);

  const trajectory = useMemo(
    () => (detail ? computeBlockTrajectory(detail.monthlyTrend) : null),
    [detail],
  );

  const leaseSignals = useMemo(
    () =>
      currentSummary
        ? buildLeaseSignals(currentSummary.leaseCommenceRange, currentYear, remainingLeaseMin)
        : [],
    [currentSummary, currentYear, remainingLeaseMin],
  );

  const leaseFinancing = useMemo(() => {
    if (!currentSummary) return null;
    // Guard against malformed data: a missing lease-commence year would
    // propagate as NaN and render garbage rather than a useful verdict.
    const leaseCommence = currentSummary.leaseCommenceRange?.[0];
    if (leaseCommence == null) return null;
    // Use the block's oldest units (fewest remaining years) so the CPF/loan
    // fit and decay clock reflect the buyer-protective worst case.
    const remainingLeaseYears = computeRemainingLeaseYears(leaseCommence, currentYear);
    return assessLeaseFinancing({
      remainingLeaseYears,
      applicantAge: searchProfile?.age ?? null,
      coApplicantAge: searchProfile?.coApplicantAge ?? null,
    });
  }, [currentSummary, currentYear, searchProfile?.age, searchProfile?.coApplicantAge]);

  const flatTypeLadder = useMemo(() => {
    if (!currentSummary || !detail?.recentTransactions) return [];
    return deriveFlatTypePriceLadder(currentSummary.flatTypes, detail.recentTransactions);
  }, [currentSummary, detail]);

  const trendPoints = useMemo(() => {
    if (!detail) return [];
    return sliceTrendByRange(detail.monthlyTrend, trendRange);
  }, [detail, trendRange]);

  const recentTransactionOutliers = useMemo(
    () =>
      detail
        ? detectRecentTransactionOutliers(detail.recentTransactions)
        : new Map<string, RecentTransactionOutlier>(),
    [detail],
  );

  const peakMonthInView = useMemo(() => {
    if (!trajectory) return null;
    const inView = trendPoints.some((point) => point.month === trajectory.peakMonth);
    return inView ? trajectory.peakMonth : null;
  }, [trajectory, trendPoints]);

  const handleTabChange = useCallback((value: string) => {
    // View Transitions API needs the DOM committed before its callback resolves
    // so it can snapshot the "after" state. startTransition defers the commit,
    // so use flushSync when the API is available.
    if (typeof document !== "undefined" && document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => setActiveTab(value));
      });
    } else {
      startTransition(() => setActiveTab(value));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyAddress = useCallback(() => {
    if (!currentSummary) return;

    void navigator.clipboard
      .writeText(`${currentSummary.block} ${currentSummary.streetName} Singapore`)
      .then(() => {
        setIsCopied(true);
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
      })
      .catch(() => {
        setIsCopied(false);
      });
  }, [currentSummary]);

  return {
    activeTab,
    handleTabChange,
    trendRange,
    setTrendRange,
    isCopied,
    handleCopyAddress,
    currentSummary,
    effectiveMedianPrice,
    effectivePricePerSqmMedian,
    medianPriceResolution,
    pricePerSqmResolution,
    cohortResolution,
    dataQualityTag,
    blockShareUrl,
    isDrawerOpen,
    explanationCodes,
    nearbyStations,
    similarBlocks,
    comparableRange,
    affordabilityVerdict,
    trajectory,
    leaseSignals,
    leaseFinancing,
    flatTypeLadder,
    trendPoints,
    recentTransactionOutliers,
    peakMonthInView,
  };
}
