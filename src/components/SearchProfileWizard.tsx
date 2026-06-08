import { useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  SEARCH_PROFILE_MAX_APPLICANT_AGE,
  SEARCH_PROFILE_MAX_MONETARY_VALUE,
  SEARCH_PROFILE_MIN_APPLICANT_AGE,
} from "@/shared/lib/constants";
import { maxAffordablePrice } from "@/shared/lib/affordability";
import { formatCurrency, formatNumber } from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import { getKnownMrtStationNames } from "@shared/mrt-station-details";
import { cn } from "@/shared/lib/utils";
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

const isOptionalInRange = (value: string, min: number, max: number) =>
  value.trim().length === 0 || (Number(value) >= min && Number(value) <= max);

const isOptionalIntegerInRange = (value: string, min: number, max: number) =>
  value.trim().length === 0 ||
  (Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max);

const WIZARD_ICONS = {
  welcome: (
    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7.5" />
      <path d="M16.5 16.5 21 21" strokeLinecap="round" />
    </svg>
  ),
  flatType: (
    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 9.5 12 3l9 6.5V20A1.5 1.5 0 0 1 19.5 21.5h-15A1.5 1.5 0 0 1 3 20V9.5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 21.5V14h6v7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  budget: (
    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 6.5v11M15 9.5c0-1.1-1.34-2-3-2s-3 .9-3 2 1.34 2 3 2 3 .9 3 2-1.34 2-3 2-3-.9-3-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  commute: (
    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="2.5" width="14" height="16" rx="3" />
      <path d="M5 12.5h14M12 2.5v10" strokeLinecap="round" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      <path d="M7 18.5l-2 3M17 18.5l2 3M9 21.5h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  lease: (
    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 9.5h18" strokeLinecap="round" />
      <path d="M8 13.5h2v2H8z" fill="currentColor" stroke="none" />
    </svg>
  ),
  affordability: (
    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 7h16v12.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5V7Z" strokeLinejoin="round" />
      <path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5V7" strokeLinejoin="round" />
      <path d="M9 13h6M9 16.5h4" strokeLinecap="round" />
    </svg>
  ),
} as const;

function WizardIcon({
  stepKey,
}: {
  stepKey: keyof typeof WIZARD_ICONS;
}) {
  return WIZARD_ICONS[stepKey] || WIZARD_ICONS.welcome;
}

export function SearchProfileWizard({ options, onComplete, onSkip }: Props) {
  const { locale, t } = useI18n();
  const [mainFlatType, setMainFlatType] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [commuteAnchorLabel, setCommuteAnchorLabel] = useState("");
  const [commuteAnchorMrt, setCommuteAnchorMrt] = useState("");
  const [maxCommute, setMaxCommute] = useState("");
  const [minLease, setMinLease] = useState("");
  const [age, setAge] = useState("");
  const [coApplicantAge, setCoApplicantAge] = useState("");
  const [cpfOABalance, setCpfOABalance] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [stationSearch, setStationSearch] = useState("");
  const [stationPickerOpen, setStationPickerOpen] = useState(false);
  const mrtStations = getKnownMrtStationNames();
  const budgetPresets = [500000, 700000, 900000, 1200000];
  const commutePresets = [20, 30, 40, 50];
  const leasePresets = [50, 60, 70, 80];
  const totalSteps = 7;
  const filteredStations = useMemo(() => {
    const query = stationSearch.trim().toUpperCase();
    if (!query) return mrtStations;
    return mrtStations.filter((station) => station.includes(query));
  }, [stationSearch, mrtStations]);

  const canContinueStep = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return mainFlatType.length > 0;
    if (step === 2) return isOptionalInRange(maxBudget, 1, SEARCH_PROFILE_MAX_MONETARY_VALUE);
    if (step === 3) return commuteAnchorLabel.trim().length > 0 && commuteAnchorMrt.length > 0 && Number(maxCommute) > 0;
    if (step === 4) return Number(minLease) > 0;
    if (step === 5) {
      return (
        isOptionalIntegerInRange(age, SEARCH_PROFILE_MIN_APPLICANT_AGE, SEARCH_PROFILE_MAX_APPLICANT_AGE) &&
        isOptionalIntegerInRange(coApplicantAge, SEARCH_PROFILE_MIN_APPLICANT_AGE, SEARCH_PROFILE_MAX_APPLICANT_AGE) &&
        isOptionalInRange(cpfOABalance, 0, SEARCH_PROFILE_MAX_MONETARY_VALUE) &&
        isOptionalInRange(monthlyIncome, 0, SEARCH_PROFILE_MAX_MONETARY_VALUE)
      );
    }
    if (step === 6) return true;
    return false;
  }, [
    step,
    mainFlatType,
    maxBudget,
    commuteAnchorLabel,
    commuteAnchorMrt,
    maxCommute,
    minLease,
    age,
    coApplicantAge,
    cpfOABalance,
    monthlyIncome,
  ]);

  const affordabilityCeiling = useMemo(
    () =>
      maxAffordablePrice({
        monthlyIncome: monthlyIncome.trim() ? Number(monthlyIncome) : null,
        cpfOABalance: cpfOABalance.trim() ? Number(cpfOABalance) : null,
        age: age.trim() ? Number(age) : null,
      }),
    [monthlyIncome, cpfOABalance, age],
  );

  const canSubmit = useMemo(() => {
    return (
      mainFlatType.length > 0 &&
      isOptionalInRange(maxBudget, 1, SEARCH_PROFILE_MAX_MONETARY_VALUE) &&
      commuteAnchorLabel.trim().length > 0 &&
      commuteAnchorMrt.length > 0 &&
      Number(maxCommute) > 0 &&
      Number(minLease) > 0 &&
      isOptionalIntegerInRange(age, SEARCH_PROFILE_MIN_APPLICANT_AGE, SEARCH_PROFILE_MAX_APPLICANT_AGE) &&
      isOptionalIntegerInRange(coApplicantAge, SEARCH_PROFILE_MIN_APPLICANT_AGE, SEARCH_PROFILE_MAX_APPLICANT_AGE) &&
      isOptionalInRange(cpfOABalance, 0, SEARCH_PROFILE_MAX_MONETARY_VALUE) &&
      isOptionalInRange(monthlyIncome, 0, SEARCH_PROFILE_MAX_MONETARY_VALUE)
    );
  }, [
    mainFlatType,
    maxBudget,
    commuteAnchorLabel,
    commuteAnchorMrt,
    maxCommute,
    minLease,
    age,
    coApplicantAge,
    cpfOABalance,
    monthlyIncome,
  ]);

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
    const parseOptionalNumber = (value: string): number | null =>
      value.trim() !== "" ? Number(value) : null;
    onComplete({
      version: 1,
      mainFlatType,
      alternativeFlatTypes: [],
      maxBudget: parseOptionalNumber(maxBudget),
      commuteAnchorLabel: commuteAnchorLabel.trim(),
      commuteAnchorMrt,
      maxComfortableCommuteMinutes: Number(maxCommute),
      commuteStretchMinutes: 10,
      minimumRemainingLeaseYears: Number(minLease),
      budgetStretchPercent: 5,
      showStretchOptions: true,
      showAllBlocks: false,
      age: parseOptionalNumber(age),
      coApplicantAge: parseOptionalNumber(coApplicantAge),
      cpfOABalance: parseOptionalNumber(cpfOABalance),
      monthlyIncome: parseOptionalNumber(monthlyIncome),
    });
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-end justify-center px-4 pb-20 pt-6 lg:items-center lg:px-0 lg:pb-0">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <Card className="wizard-panel-in relative w-full max-w-[calc(100vw-2rem)] overflow-visible rounded-[1.25rem] border bg-popover/95 shadow-xl backdrop-blur-2xl lg:w-[28.75rem] lg:max-w-[28.75rem]">
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
                      : "w-2 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>

          <div className="min-h-[19rem] lg:min-h-[17rem]">
            <div
              key={step}
              className="wizard-step-anim"
              style={{
                "--wizard-x": direction > 0 ? "20px" : "-20px",
              } as CSSProperties}
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
                          aria-pressed={selected}
                          onClick={() => setMainFlatType(selected ? "" : flatType)}
                          className={cn(
                            "rounded-[0.65rem] px-5 py-2.5 text-[0.82rem] font-bold tracking-[0.02em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            selected
                              ? "scale-[1.04] bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
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
                  <div className="rounded-[0.65rem] border bg-muted/40 px-4">
                    <div className="flex items-center">
                      <span className="pr-2 text-sm font-bold text-muted-foreground">S$</span>
                      <Input
                        inputMode="numeric"
                        enterKeyHint="done"
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
                          aria-pressed={active}
                          onClick={() => setMaxBudget(active ? "" : String(preset))}
                          className={cn(
                            "rounded-[0.55rem] border px-3.5 py-2 text-xs font-bold [font-variant-numeric:tabular-nums] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
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
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("searchProfile.commuteDestination")}
                      </p>
                      <div className="rounded-[0.65rem] border bg-muted/40 px-4">
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
                            className="flex h-12 w-full items-center justify-between rounded-[0.65rem] border bg-muted/40 px-4 text-left text-[0.95rem] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                          >
                            <span className={commuteAnchorMrt ? "text-foreground" : "text-muted-foreground"}>
                              {commuteAnchorMrt ? formatStationLabel(commuteAnchorMrt) : t("searchProfile.selectMrtStation")}
                            </span>
                            <ChevronDown className="size-4 text-muted-foreground transition-transform data-[open=true]:rotate-180" data-open={stationPickerOpen} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="z-[110] w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-[0.9rem] border bg-popover/98 p-0 shadow-lg backdrop-blur-xl">
                          <div className="border-b border-border/60 p-2.5">
                            <div className="rounded-[0.6rem] bg-muted/40 px-3">
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
                          {filteredStations.length === 0 ? (
                            <div className="max-h-56 overflow-y-auto py-4 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
                              {t("searchProfile.noMrtStationFound")}
                            </div>
                          ) : (
                            <div className="max-h-56 overflow-y-auto py-1" role="listbox" aria-label="MRT stations">
                              {filteredStations.slice(0, 40).map((station) => (
                                <button
                                  key={station}
                                  type="button"
                                  role="option"
                                  aria-selected={commuteAnchorMrt === station}
                                  onClick={() => {
                                    setCommuteAnchorMrt(station);
                                    setStationPickerOpen(false);
                                  }}
                                  className={cn(
                                    "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                    commuteAnchorMrt === station && "bg-primary/10 text-primary",
                                  )}
                                >
                                  <span>{formatStationLabel(station)}</span>
                                  {commuteAnchorMrt === station ? <Check className="size-4" /> : null}
                                </button>
                              ))}
                            </div>
                          )}
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
                              aria-pressed={active}
                              onClick={() => setMaxCommute(active ? "" : String(preset))}
                              className={cn(
                                "rounded-[0.55rem] border px-3.5 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
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
                  <div className="rounded-[0.65rem] border bg-muted/40 px-4">
                    <div className="flex items-center">
                      <Input
                        inputMode="numeric"
                        enterKeyHint="done"
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
                          aria-pressed={active}
                          onClick={() => setMinLease(active ? "" : String(preset))}
                          className={cn(
                            "rounded-[0.55rem] border px-3.5 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
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
                <div>
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                      <WizardIcon stepKey="affordability" />
                    </div>
                    <div>
                      <p className="text-[1.35rem] font-extrabold tracking-[-0.02em] text-foreground">
                        {t("searchProfile.wizard.question.affordability")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("searchProfile.wizard.hint.affordability")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          {t("searchProfile.age")}
                        </p>
                        <div className="rounded-[0.65rem] border bg-muted/40 px-4">
                          <Input
                            inputMode="numeric"
                            enterKeyHint="done"
                            type="number"
                            step="1"
                            min={SEARCH_PROFILE_MIN_APPLICANT_AGE}
                            max={SEARCH_PROFILE_MAX_APPLICANT_AGE}
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            placeholder={t("searchProfile.agePlaceholder")}
                            aria-label={t("searchProfile.age")}
                            className="h-12 border-0 px-0 py-0 text-[0.95rem] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          {t("searchProfile.coApplicantAge")}
                        </p>
                        <div className="rounded-[0.65rem] border bg-muted/40 px-4">
                          <Input
                            inputMode="numeric"
                            enterKeyHint="done"
                            type="number"
                            step="1"
                            min={SEARCH_PROFILE_MIN_APPLICANT_AGE}
                            max={SEARCH_PROFILE_MAX_APPLICANT_AGE}
                            value={coApplicantAge}
                            onChange={(e) => setCoApplicantAge(e.target.value)}
                            placeholder={t("searchProfile.coApplicantAgePlaceholder")}
                            aria-label={t("searchProfile.coApplicantAge")}
                            className="h-12 border-0 px-0 py-0 text-[0.95rem] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("searchProfile.cpfOABalance")}
                      </p>
                      <div className="rounded-[0.65rem] border bg-muted/40 px-4">
                        <div className="flex items-center">
                          <span className="pr-2 text-sm font-bold text-muted-foreground">S$</span>
                          <Input
                            inputMode="numeric"
                            enterKeyHint="done"
                            type="number"
                            value={cpfOABalance}
                            onChange={(e) => setCpfOABalance(e.target.value)}
                            placeholder={t("searchProfile.cpfOABalancePlaceholder")}
                            aria-label={t("searchProfile.cpfOABalance")}
                            className="h-12 border-0 px-0 py-0 text-[0.95rem] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("searchProfile.monthlyIncome")}
                      </p>
                      <div className="rounded-[0.65rem] border bg-muted/40 px-4">
                        <div className="flex items-center">
                          <span className="pr-2 text-sm font-bold text-muted-foreground">S$</span>
                          <Input
                            inputMode="numeric"
                            enterKeyHint="done"
                            type="number"
                            value={monthlyIncome}
                            onChange={(e) => setMonthlyIncome(e.target.value)}
                            placeholder={t("searchProfile.monthlyIncomePlaceholder")}
                            aria-label={t("searchProfile.monthlyIncome")}
                            className="h-12 border-0 px-0 py-0 text-[0.95rem] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 6 ? (
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
                    <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                      {mainFlatType}
                    </div>
                    {maxBudget ? (
                      <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {`S$${formatNumber(Number(maxBudget), 0, locale)}`}
                      </div>
                    ) : null}
                    <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                      {formatStationLabel(commuteAnchorMrt)}
                    </div>
                    <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                      {t("searchProfile.minutesPreset", { value: Number(maxCommute) })}
                    </div>
                    <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                      {t("searchProfile.yearsPreset", { value: Number(minLease) })}
                    </div>
                    {age ? (
                      <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {t("searchProfile.chip.age", { age: Number(age) })}
                      </div>
                    ) : null}
                    {coApplicantAge ? (
                      <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {t("searchProfile.chip.coApplicantAge", { age: Number(coApplicantAge) })}
                      </div>
                    ) : null}
                    {cpfOABalance ? (
                      <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {t("searchProfile.chip.cpfOABalance", { amount: formatNumber(Number(cpfOABalance), 0, locale) })}
                      </div>
                    ) : null}
                    {monthlyIncome ? (
                      <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {t("searchProfile.chip.monthlyIncome", { amount: formatNumber(Number(monthlyIncome), 0, locale) })}
                      </div>
                    ) : null}
                  </div>
                  {age.trim() && cpfOABalance.trim() && affordabilityCeiling > 0 ? (
                    <div className="mt-5 rounded-[0.65rem] border border-success/30 bg-success/[0.06] px-4 py-3 text-left">
                      <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-success">
                        {t("affordability.ceiling", { price: formatCurrency(affordabilityCeiling, locale) })}
                      </p>
                      {monthlyIncome.trim() ? (
                        <p className="mt-1 text-[0.68rem] font-semibold leading-snug text-muted-foreground">
                          {t("affordability.summary", {
                            cpf: formatCurrency(Number(cpfOABalance), locale),
                            income: formatCurrency(Number(monthlyIncome), locale),
                            age: Number(age),
                            price: formatCurrency(affordabilityCeiling, locale),
                          })}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
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
              className="rounded-[0.65rem] bg-secondary px-4 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {t("searchProfile.back")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSkip}
              className="px-1 py-2 text-xs font-bold uppercase tracking-[0.06em] text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-md"
            >
              {t("searchProfile.skip")}
            </button>
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinueStep || (step === totalSteps - 1 && !canSubmit)}
            className="rounded-[0.65rem] bg-[color-mix(in_oklab,var(--primary),#000_35%)] px-6 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-white transition-[color,background-color,box-shadow] enabled:hover:bg-[color-mix(in_oklab,var(--primary),#000_50%)] disabled:cursor-not-allowed disabled:bg-muted/70 disabled:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {nextLabel}
          </button>
        </div>
      </Card>
    </div>
  );
}
