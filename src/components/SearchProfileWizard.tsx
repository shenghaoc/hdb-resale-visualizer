import { useMemo, useState, type CSSProperties } from "react";
import {
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Search,
  TrainFront,
} from "lucide-react";
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
  welcome: Search,
  flatType: Building2,
  budget: CircleDollarSign,
  commute: TrainFront,
  lease: CalendarRange,
  affordability: ClipboardList,
} as const;

function WizardIcon({ stepKey }: { stepKey: keyof typeof WIZARD_ICONS }) {
  const Icon = WIZARD_ICONS[stepKey];
  return <Icon className="size-8" strokeWidth={1.5} aria-hidden="true" />;
}

function WizardStepIcon({
  stepKey,
  size = "md",
}: {
  stepKey: keyof typeof WIZARD_ICONS;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-none bg-primary/10 text-primary",
        size === "lg" ? "mx-auto mb-4 size-14" : "size-12 shrink-0",
      )}
    >
      <WizardIcon stepKey={stepKey} />
    </div>
  );
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
    if (step === 3)
      return (
        commuteAnchorLabel.trim().length > 0 &&
        commuteAnchorMrt.length > 0 &&
        Number(maxCommute) > 0
      );
    if (step === 4) return Number(minLease) > 0;
    if (step === 5) {
      return (
        isOptionalIntegerInRange(
          age,
          SEARCH_PROFILE_MIN_APPLICANT_AGE,
          SEARCH_PROFILE_MAX_APPLICANT_AGE,
        ) &&
        isOptionalIntegerInRange(
          coApplicantAge,
          SEARCH_PROFILE_MIN_APPLICANT_AGE,
          SEARCH_PROFILE_MAX_APPLICANT_AGE,
        ) &&
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
        coApplicantAge: coApplicantAge.trim() ? Number(coApplicantAge) : null,
      }),
    [monthlyIncome, cpfOABalance, age, coApplicantAge],
  );

  const canSubmit = useMemo(() => {
    return (
      mainFlatType.length > 0 &&
      isOptionalInRange(maxBudget, 1, SEARCH_PROFILE_MAX_MONETARY_VALUE) &&
      commuteAnchorLabel.trim().length > 0 &&
      commuteAnchorMrt.length > 0 &&
      Number(maxCommute) > 0 &&
      Number(minLease) > 0 &&
      isOptionalIntegerInRange(
        age,
        SEARCH_PROFILE_MIN_APPLICANT_AGE,
        SEARCH_PROFILE_MAX_APPLICANT_AGE,
      ) &&
      isOptionalIntegerInRange(
        coApplicantAge,
        SEARCH_PROFILE_MIN_APPLICANT_AGE,
        SEARCH_PROFILE_MAX_APPLICANT_AGE,
      ) &&
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
      <div className="absolute inset-0 bg-black/50" />
      <Card className="wizard-panel-in relative w-full max-w-[calc(100vw-2rem)] overflow-visible rounded-none border bg-popover shadow-sm lg:w-[28.75rem] lg:max-w-[28.75rem]">
        <CardContent className="overflow-hidden px-5 py-6 lg:px-8 lg:py-7">
          <div className="mb-6 flex items-center justify-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-2 rounded-full transition-[width,background-color] duration-300",
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
              style={
                {
                  "--wizard-x": direction > 0 ? "20px" : "-20px",
                } as CSSProperties
              }
            >
              {step === 0 ? (
                <div className="pt-2 text-center">
                  <WizardStepIcon stepKey="welcome" size="lg" />
                  <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
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
                    <WizardStepIcon stepKey="flatType" />
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
                            "rounded-none px-5 py-2.5 text-[length:var(--text-sm)] font-bold tracking-[0.02em] transition-[color,background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
                    <WizardStepIcon stepKey="budget" />
                    <div>
                      <p className="text-[1.35rem] font-extrabold tracking-[-0.02em] text-foreground">
                        {t("searchProfile.wizard.question.budget")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("searchProfile.wizard.hint.budget")}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-none border bg-muted/40 px-4">
                    <div className="flex items-center">
                      <span className="pr-2 text-sm font-bold text-muted-foreground">S$</span>
                      <Input
                        inputMode="numeric"
                        enterKeyHint="done"
                        type="number"
                        value={maxBudget}
                        onChange={(e) => setMaxBudget(e.target.value)}
                        placeholder={t("searchProfile.maxBudgetPlaceholder")}
                        className="h-12 border-0 px-0 py-0 text-[length:var(--text-base)] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
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
                            "rounded-none border px-3.5 py-2 text-xs font-bold [font-variant-numeric:tabular-nums] transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
                          )}
                        >
                          {preset >= 1000000
                            ? `S$${(preset / 1000000).toFixed(1)}M`
                            : `S$${Math.round(preset / 1000)}K`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div>
                  <div className="mb-5 flex items-start gap-3">
                    <WizardStepIcon stepKey="commute" />
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
                      <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
                        {t("searchProfile.commuteDestination")}
                      </p>
                      <div className="rounded-none border bg-muted/40 px-4">
                        <Input
                          value={commuteAnchorLabel}
                          onChange={(e) => setCommuteAnchorLabel(e.target.value)}
                          placeholder={t("searchProfile.commuteAnchorPlaceholder")}
                          className="h-12 border-0 px-0 py-0 text-[length:var(--text-base)] font-semibold focus-visible:border-0"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
                        {t("searchProfile.commuteMrtStation")}
                      </p>
                      <Popover open={stationPickerOpen} onOpenChange={setStationPickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex h-12 w-full items-center justify-between rounded-none border bg-muted/40 px-4 text-left text-[length:var(--text-base)] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                          >
                            <span
                              className={
                                commuteAnchorMrt ? "text-foreground" : "text-muted-foreground"
                              }
                            >
                              {commuteAnchorMrt
                                ? formatStationLabel(commuteAnchorMrt)
                                : t("searchProfile.selectMrtStation")}
                            </span>
                            <ChevronDown
                              className="size-4 text-muted-foreground transition-transform data-[open=true]:rotate-180"
                              data-open={stationPickerOpen}
                            />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="z-[110] w-[min(24rem,calc(100vw-2rem))] gap-3 border bg-popover p-0 shadow-lg">
                          <div className="border-b border-border/60 p-2.5">
                            <div className="rounded-none bg-muted/40 px-3">
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
                            <div
                              className="max-h-56 overflow-y-auto py-4 text-center text-sm text-muted-foreground"
                              role="status"
                              aria-live="polite"
                            >
                              {t("searchProfile.noMrtStationFound")}
                            </div>
                          ) : (
                            <div
                              className="max-h-56 overflow-y-auto py-1"
                              role="listbox"
                              aria-label="MRT stations"
                            >
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
                                  {commuteAnchorMrt === station ? (
                                    <Check className="size-4" />
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
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
                                "rounded-none border px-3.5 py-2 text-xs font-bold transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
                    <WizardStepIcon stepKey="lease" />
                    <div>
                      <p className="text-[1.35rem] font-extrabold tracking-[-0.02em] text-foreground">
                        {t("searchProfile.wizard.question.lease")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("searchProfile.wizard.hint.lease")}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-none border bg-muted/40 px-4">
                    <div className="flex items-center">
                      <Input
                        inputMode="numeric"
                        enterKeyHint="done"
                        type="number"
                        value={minLease}
                        onChange={(e) => setMinLease(e.target.value)}
                        placeholder={t("searchProfile.minLeasePlaceholder")}
                        className="h-12 border-0 px-0 py-0 text-[length:var(--text-base)] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                      />
                      <span className="pl-2 text-[0.75rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
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
                            "rounded-none border px-3.5 py-2 text-xs font-bold transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
                    <WizardStepIcon stepKey="affordability" />
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
                        <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
                          {t("searchProfile.age")}
                        </p>
                        <div className="rounded-none border bg-muted/40 px-4">
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
                            className="h-12 border-0 px-0 py-0 text-[length:var(--text-base)] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
                          {t("searchProfile.coApplicantAge")}
                        </p>
                        <div className="rounded-none border bg-muted/40 px-4">
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
                            className="h-12 border-0 px-0 py-0 text-[length:var(--text-base)] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
                        {t("searchProfile.cpfOABalance")}
                      </p>
                      <div className="rounded-none border bg-muted/40 px-4">
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
                            className="h-12 border-0 px-0 py-0 text-[length:var(--text-base)] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
                        {t("searchProfile.monthlyIncome")}
                      </p>
                      <div className="rounded-none border bg-muted/40 px-4">
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
                            className="h-12 border-0 px-0 py-0 text-[length:var(--text-base)] font-semibold [font-variant-numeric:tabular-nums] focus-visible:border-0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 6 ? (
                <div className="pt-2 text-center">
                  <WizardStepIcon stepKey="welcome" size="lg" />
                  <p className="text-[1.45rem] font-extrabold tracking-[-0.02em] text-foreground">
                    {t("searchProfile.wizard.question.review")}
                  </p>
                  <p className="mx-auto mt-3 max-w-[22rem] text-sm leading-6 text-muted-foreground">
                    {t("searchProfile.wizard.hint.review")}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <div className="rounded-none bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                      {mainFlatType}
                    </div>
                    {maxBudget ? (
                      <div className="rounded-none bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {`S$${formatNumber(Number(maxBudget), 0, locale)}`}
                      </div>
                    ) : null}
                    <div className="rounded-none bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                      {formatStationLabel(commuteAnchorMrt)}
                    </div>
                    <div className="rounded-none bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                      {t("searchProfile.minutesPreset", { value: Number(maxCommute) })}
                    </div>
                    <div className="rounded-none bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                      {t("searchProfile.yearsPreset", { value: Number(minLease) })}
                    </div>
                    {age ? (
                      <div className="rounded-none bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {t("searchProfile.chip.age", { age: Number(age) })}
                      </div>
                    ) : null}
                    {coApplicantAge ? (
                      <div className="rounded-none bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {t("searchProfile.chip.coApplicantAge", { age: Number(coApplicantAge) })}
                      </div>
                    ) : null}
                    {cpfOABalance ? (
                      <div className="rounded-none bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {t("searchProfile.chip.cpfOABalance", {
                          amount: formatNumber(Number(cpfOABalance), 0, locale),
                        })}
                      </div>
                    ) : null}
                    {monthlyIncome ? (
                      <div className="rounded-none bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                        {t("searchProfile.chip.monthlyIncome", {
                          amount: formatNumber(Number(monthlyIncome), 0, locale),
                        })}
                      </div>
                    ) : null}
                  </div>
                  {age.trim() && cpfOABalance.trim() && affordabilityCeiling > 0 ? (
                    <div className="mt-5 rounded-none border border-success/30 bg-success/[0.06] px-4 py-3 text-left">
                      <p className="text-[length:var(--text-xs)] font-extrabold uppercase tracking-[var(--tracking-label)] text-success">
                        {t("affordability.ceiling", {
                          price: formatCurrency(affordabilityCeiling, locale),
                        })}
                      </p>
                      {monthlyIncome.trim() ? (
                        <p className="mt-1 text-[0.75rem] font-semibold leading-snug text-muted-foreground">
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
              className="rounded-none bg-secondary px-4 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {t("searchProfile.back")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSkip}
              className="px-1 py-2 text-xs font-bold uppercase tracking-[0.06em] text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-none"
            >
              {t("searchProfile.skip")}
            </button>
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinueStep || (step === totalSteps - 1 && !canSubmit)}
            className="rounded-none bg-primary px-6 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-primary-foreground transition-[color,background-color,box-shadow] enabled:hover:bg-primary/80 disabled:cursor-not-allowed disabled:bg-muted/70 disabled:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {nextLabel}
          </button>
        </div>
      </Card>
    </div>
  );
}
