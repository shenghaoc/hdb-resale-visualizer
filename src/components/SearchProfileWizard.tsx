import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { getKnownMrtStationNames } from "@/lib/mrt-station-details";
import { cn } from "@/lib/utils";
import type { FilterOptions } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

type Props = {
  options: FilterOptions;
  onComplete: (profile: SearchProfile) => void;
  onSkip: () => void;
};

function formatStationLabel(stationName: string) {
  return stationName
    .replace(/ MRT STATION$/u, "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function WizardIcon({
  stepKey,
}: {
  stepKey: "welcome" | "flatType" | "budget" | "commute" | "lease";
}) {
  if (stepKey === "welcome") {
    return (
      <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="7.5" />
        <path d="M16.5 16.5 21 21" strokeLinecap="round" />
      </svg>
    );
  }
  if (stepKey === "flatType") {
    return (
      <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 9.5 12 3l9 6.5V20A1.5 1.5 0 0 1 19.5 21.5h-15A1.5 1.5 0 0 1 3 20V9.5Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 21.5V14h6v7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (stepKey === "budget") {
    return (
      <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M12 6.5v11M15 9.5c0-1.1-1.34-2-3-2s-3 .9-3 2 1.34 2 3 2 3 .9 3 2-1.34 2-3 2-3-.9-3-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (stepKey === "commute") {
    return (
      <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="2.5" width="14" height="16" rx="3" />
        <path d="M5 12.5h14M12 2.5v10" strokeLinecap="round" />
        <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
        <path d="M7 18.5l-2 3M17 18.5l2 3M9 21.5h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 9.5h18" strokeLinecap="round" />
      <path d="M8 13.5h2v2H8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SearchProfileWizard({ options, onComplete, onSkip }: Props) {
  const { t } = useI18n();
  const [mainFlatType, setMainFlatType] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [commuteAnchorLabel, setCommuteAnchorLabel] = useState("");
  const [commuteAnchorMrt, setCommuteAnchorMrt] = useState("");
  const [maxCommute, setMaxCommute] = useState("");
  const [minLease, setMinLease] = useState("");
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [stationSearch, setStationSearch] = useState("");
  const [stationPickerOpen, setStationPickerOpen] = useState(false);
  const isDesktop = typeof window !== "undefined" ? window.innerWidth >= 1024 : true;
  const mrtStations = getKnownMrtStationNames();
  const budgetPresets = [500000, 700000, 900000, 1200000];
  const commutePresets = [20, 30, 40, 50];
  const leasePresets = [50, 60, 70, 80];
  const totalSteps = 6;
  const filteredStations = (() => {
    const query = stationSearch.trim().toUpperCase();
    if (!query) return mrtStations;
    return mrtStations.filter((station) => station.includes(query));
  })();

  const canContinueStep = (() => {
    if (step === 0) return true;
    if (step === 1) return mainFlatType.length > 0;
    if (step === 2) return maxBudget.trim().length === 0 || Number(maxBudget) > 0;
    if (step === 3) return commuteAnchorLabel.trim().length > 0 && commuteAnchorMrt.length > 0 && Number(maxCommute) > 0;
    if (step === 4) return Number(minLease) > 0;
    if (step === 5) return true;
    return false;
  })();

  const canSubmit =
    mainFlatType.length > 0 &&
    (maxBudget.trim().length === 0 || Number(maxBudget) > 0) &&
    commuteAnchorLabel.trim().length > 0 &&
    commuteAnchorMrt.length > 0 &&
    Number(maxCommute) > 0 &&
    Number(minLease) > 0;

  const nextLabel =
    step === 0
      ? t("searchProfile.getStarted")
      : step === totalSteps - 1
        ? t("searchProfile.continue")
        : t("searchProfile.next");

  const handleContinue = () => {
    if (step < totalSteps - 1) {
      setDirection(1);
      setStep((prev) => prev + 1);
      return;
    }

    if (!canSubmit) return;
    onComplete({
      version: 1,
      mainFlatType,
      alternativeFlatTypes: [],
      maxBudget: maxBudget ? Number(maxBudget) : null,
      commuteAnchorLabel: commuteAnchorLabel.trim(),
      commuteAnchorMrt,
      maxComfortableCommuteMinutes: Number(maxCommute),
      commuteStretchMinutes: 10,
      minimumRemainingLeaseYears: Number(minLease),
      budgetStretchPercent: 5,
      showStretchOptions: true,
      showAllBlocks: false,
    });
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-end justify-center px-4 pb-20 pt-6 lg:items-center lg:px-0 lg:pb-0">
      <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px] dark:bg-slate-950/55" />
      <Card className="wizard-panel-in relative w-full max-w-[calc(100vw-2rem)] overflow-visible rounded-[1.25rem] border border-border/70 bg-card/95 shadow-[0_24px_80px_rgba(23,28,31,0.15)] backdrop-blur-2xl dark:border-primary/15 dark:bg-card/95 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_24px_80px_rgba(4,12,24,0.9)] lg:w-[28.75rem] lg:max-w-[28.75rem]">
        <div className="h-[3px] w-full rounded-t-[1.25rem] bg-gradient-to-r from-primary to-transparent opacity-60" />
        <CardContent className="overflow-hidden px-5 py-6 lg:px-8 lg:py-7">
          <div className="mb-6 flex items-center justify-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  index === step
                    ? "w-6 bg-primary"
                    : index < step
                      ? "w-2 bg-primary/35"
                      : "w-2 bg-black/8 dark:bg-white/10",
                )}
              />
            ))}
          </div>

          <div className={cn("min-h-[19rem]", isDesktop ? "lg:min-h-[17rem]" : "")}>
            <div
              key={step}
              style={{
                animation: `${direction > 0 ? "wizard-step-enter-fwd" : "wizard-step-enter-back"} 280ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards`,
              }}
            >
              {step === 0 ? (
                <div className="pt-2 text-center">
                  <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                    <WizardIcon stepKey="welcome" />
                  </div>
                  <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    {t("searchProfile.wizard.kicker")}
                  </p>
                  <h2 className="text-[1.5rem] font-extrabold tracking-[-0.02em] text-foreground lg:text-[1.65rem]">
                    {t("searchProfile.wizard.title")}
                  </h2>
                  <p className="mx-auto mt-3 max-w-[21rem] text-sm leading-6 text-muted-foreground">
                    {t("searchProfile.wizard.subtitle")}
                  </p>
                </div>
              ) : null}

              {step === 1 ? (
                <div>
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                      <WizardIcon stepKey="flatType" />
                    </div>
                    <div>
                      <p className="text-[1.35rem] font-extrabold tracking-[-0.02em] text-foreground">
                        {t("searchProfile.wizard.question.flatType")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("searchProfile.wizard.hint.flatType")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {options.flatTypes.map((flatType) => {
                      const selected = mainFlatType === flatType;
                      return (
                        <button
                          key={flatType}
                          type="button"
                          onClick={() => setMainFlatType(selected ? "" : flatType)}
                          className={cn(
                            "rounded-[0.65rem] px-5 py-2.5 text-[0.82rem] font-bold tracking-[0.02em] transition-all duration-200",
                            selected
                              ? "scale-[1.04] bg-primary text-primary-foreground"
                              : "bg-black/[0.04] text-slate-500 hover:bg-black/[0.06] dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.09]",
                          )}
                        >
                          {flatType}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div>
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                      <WizardIcon stepKey="budget" />
                    </div>
                    <div>
                      <p className="text-[1.35rem] font-extrabold tracking-[-0.02em] text-foreground">
                        {t("searchProfile.wizard.question.budget")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("searchProfile.wizard.hint.budget")}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-[0.65rem] border border-black/10 bg-black/[0.02] px-4 dark:border-primary/20 dark:bg-white/[0.04]">
                    <div className="flex items-center">
                      <span className="pr-2 text-sm font-bold text-muted-foreground">S$</span>
                      <Input
                        inputMode="numeric"
                        type="number"
                        value={maxBudget}
                        onChange={(e) => setMaxBudget(e.target.value)}
                        placeholder={t("searchProfile.maxBudgetPlaceholder")}
                        className="h-12 border-0 px-0 py-0 text-[0.95rem] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {budgetPresets.map((preset) => {
                      const active = maxBudget === String(preset);
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setMaxBudget(active ? "" : String(preset))}
                          className={cn(
                            "rounded-[0.55rem] border px-3.5 py-2 text-xs font-bold [font-variant-numeric:tabular-nums] transition-all",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-black/8 text-slate-500 hover:bg-black/[0.03] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.05]",
                          )}
                        >
                          {preset >= 1000000 ? `S$${(preset / 1000000).toFixed(1)}M` : `S$${Math.round(preset / 1000)}K`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div>
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                      <WizardIcon stepKey="commute" />
                    </div>
                    <div>
                      <p className="text-[1.35rem] font-extrabold tracking-[-0.02em] text-foreground">
                        {t("searchProfile.wizard.question.commute")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("searchProfile.wizard.hint.commute")}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("searchProfile.commuteDestination")}
                      </p>
                      <div className="rounded-[0.65rem] border border-black/10 bg-black/[0.02] px-4 dark:border-primary/20 dark:bg-white/[0.04]">
                        <Input
                          value={commuteAnchorLabel}
                          onChange={(e) => setCommuteAnchorLabel(e.target.value)}
                          placeholder={t("searchProfile.commuteAnchorPlaceholder")}
                          className="h-12 border-0 px-0 py-0 text-[0.95rem] font-semibold focus-visible:border-0"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("searchProfile.commuteMrtStation")}
                      </p>
                      <Popover open={stationPickerOpen} onOpenChange={setStationPickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex h-12 w-full items-center justify-between rounded-[0.65rem] border border-black/10 bg-black/[0.02] px-4 text-left text-[0.95rem] font-semibold dark:border-primary/20 dark:bg-white/[0.04]"
                          >
                            <span className={commuteAnchorMrt ? "text-foreground" : "text-muted-foreground"}>
                              {commuteAnchorMrt ? formatStationLabel(commuteAnchorMrt) : t("searchProfile.selectMrtStation")}
                            </span>
                            <ChevronDown className="size-4 text-muted-foreground transition-transform data-[open=true]:rotate-180" data-open={stationPickerOpen} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="z-[70] w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-[0.9rem] border border-border/70 bg-popover/98 p-0 shadow-[0_12px_40px_rgba(23,28,31,0.12)] backdrop-blur-xl dark:border-primary/15 dark:bg-popover">
                          <div className="border-b border-border/60 p-2.5">
                            <div className="rounded-[0.6rem] bg-black/[0.03] px-3 dark:bg-white/[0.06]">
                              <div className="flex items-center gap-2">
                                <Search className="size-4 text-muted-foreground" />
                                <Input
                                  value={stationSearch}
                                  onChange={(e) => setStationSearch(e.target.value)}
                                  placeholder={t("searchProfile.searchMrtStation")}
                                  className="h-10 border-0 px-0 py-0 text-sm font-medium focus-visible:border-0"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="max-h-56 overflow-y-auto py-1">
                            {filteredStations.length === 0 ? (
                              <p className="px-4 py-4 text-center text-sm text-muted-foreground">
                                {t("searchProfile.noMrtStationFound")}
                              </p>
                            ) : (
                              filteredStations.slice(0, 40).map((station) => (
                                <button
                                  key={station}
                                  type="button"
                                  onClick={() => {
                                    setCommuteAnchorMrt(station);
                                    setStationPickerOpen(false);
                                  }}
                                  className={cn(
                                    "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
                                    commuteAnchorMrt === station && "bg-primary/8 text-primary dark:bg-primary/10",
                                  )}
                                >
                                  <span>{formatStationLabel(station)}</span>
                                  {commuteAnchorMrt === station ? <Check className="size-4" /> : null}
                                </button>
                              ))
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("searchProfile.maxCommute")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {commutePresets.map((preset) => {
                          const active = maxCommute === String(preset);
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setMaxCommute(active ? "" : String(preset))}
                              className={cn(
                                "rounded-[0.55rem] border px-3.5 py-2 text-xs font-bold transition-all",
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-black/8 text-slate-500 hover:bg-black/[0.03] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.05]",
                              )}
                            >
                              {t("searchProfile.minutesPreset", { value: preset })}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <div>
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                      <WizardIcon stepKey="lease" />
                    </div>
                    <div>
                      <p className="text-[1.35rem] font-extrabold tracking-[-0.02em] text-foreground">
                        {t("searchProfile.wizard.question.lease")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("searchProfile.wizard.hint.lease")}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-[0.65rem] border border-black/10 bg-black/[0.02] px-4 dark:border-primary/20 dark:bg-white/[0.04]">
                    <div className="flex items-center">
                      <Input
                        inputMode="numeric"
                        type="number"
                        value={minLease}
                        onChange={(e) => setMinLease(e.target.value)}
                        placeholder={t("searchProfile.minLeasePlaceholder")}
                        className="h-12 border-0 px-0 py-0 text-[0.95rem] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                      />
                      <span className="pl-2 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        {t("searchProfile.yearsShort")}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {leasePresets.map((preset) => {
                      const active = minLease === String(preset);
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setMinLease(active ? "" : String(preset))}
                          className={cn(
                            "rounded-[0.55rem] border px-3.5 py-2 text-xs font-bold transition-all",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-black/8 text-slate-500 hover:bg-black/[0.03] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.05]",
                          )}
                        >
                          {t("searchProfile.yearsPresetShort", { value: preset })}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 5 ? (
                <div className="pt-2 text-center">
                  <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                    <WizardIcon stepKey="welcome" />
                  </div>
                  <p className="text-[1.45rem] font-extrabold tracking-[-0.02em] text-foreground">
                    {t("searchProfile.wizard.question.review")}
                  </p>
                  <p className="mx-auto mt-3 max-w-[22rem] text-sm leading-6 text-muted-foreground">
                    {t("searchProfile.wizard.hint.review")}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <div className="rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                      {mainFlatType}
                    </div>
                    {maxBudget ? (
                      <div className="rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                        {`S$${Number(maxBudget).toLocaleString()}`}
                      </div>
                    ) : null}
                    <div className="rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                      {formatStationLabel(commuteAnchorMrt)}
                    </div>
                    <div className="rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                      {t("searchProfile.minutesPreset", { value: Number(maxCommute) })}
                    </div>
                    <div className="rounded-full bg-black/[0.04] px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                      {t("searchProfile.yearsPreset", { value: Number(minLease) })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
        <div className="flex items-center justify-between gap-3 px-5 pb-6 pt-1 lg:px-8 lg:pb-7">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setDirection(-1);
                setStep((prev) => Math.max(0, prev - 1));
              }}
              className="rounded-[0.65rem] bg-black/[0.04] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-slate-500 transition-colors hover:bg-black/[0.06] dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.09]"
            >
              {t("searchProfile.back")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSkip}
              className="px-1 py-2 text-xs font-bold uppercase tracking-[0.06em] text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {t("searchProfile.skip")}
            </button>
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinueStep || (step === totalSteps - 1 && !canSubmit)}
            className={cn(
              "rounded-[0.65rem] px-6 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] transition-all",
              !canContinueStep || (step === totalSteps - 1 && !canSubmit)
                ? "cursor-default bg-black/[0.06] text-slate-400 dark:bg-white/[0.06] dark:text-slate-500"
                : "bg-primary text-primary-foreground hover:brightness-95",
            )}
          >
            {nextLabel}
          </button>
        </div>
      </Card>
    </div>
  );
}
