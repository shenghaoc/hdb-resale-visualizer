import { useMemo, useState, type CSSProperties } from "react";
import { Building2, CalendarRange, CircleDollarSign, ClipboardList, Search } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  SEARCH_PROFILE_MAX_APPLICANT_AGE,
  SEARCH_PROFILE_MIN_APPLICANT_AGE,
} from "@/shared/lib/constants";
import { isAffordabilityProfileComplete, maxAffordablePrice } from "@/shared/lib/affordability";
import { formatCompactCurrency, formatCurrency, formatNumber } from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import type { FilterOptions } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";
import {
  buildSearchProfileFromWizard,
  canContinueSearchProfileStep,
  canSubmitSearchProfileDraft,
  parseOptionalNumber,
  type SearchProfileWizardDraft,
} from "./searchProfileWizardLogic";

type Props = {
  options: FilterOptions;
  initialProfile?: SearchProfile;
  onComplete: (profile: SearchProfile) => void;
  onSkip: () => void;
};

const WIZARD_ICONS = {
  welcome: Search,
  flatType: Building2,
  budget: CircleDollarSign,
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

function optionalNumberInputValue(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

export function SearchProfileWizard({ options, initialProfile, onComplete, onSkip }: Props) {
  const { locale, t } = useI18n();
  const [mainFlatType, setMainFlatType] = useState(() => initialProfile?.mainFlatType ?? "");
  const [maxBudget, setMaxBudget] = useState(() =>
    optionalNumberInputValue(initialProfile?.maxBudget),
  );
  const [minLease, setMinLease] = useState(() =>
    optionalNumberInputValue(initialProfile?.minimumRemainingLeaseYears),
  );
  const [age, setAge] = useState(() => optionalNumberInputValue(initialProfile?.age));
  const [coApplicantAge, setCoApplicantAge] = useState(() =>
    optionalNumberInputValue(initialProfile?.coApplicantAge),
  );
  const [cpfOABalance, setCpfOABalance] = useState(() =>
    optionalNumberInputValue(initialProfile?.cpfOABalance),
  );
  const [monthlyIncome, setMonthlyIncome] = useState(() =>
    optionalNumberInputValue(initialProfile?.monthlyIncome),
  );
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const budgetPresets = [500000, 700000, 900000, 1200000];
  const leasePresets = [50, 60, 70, 80];
  const totalSteps = 5;
  const draft: SearchProfileWizardDraft = {
    mainFlatType,
    maxBudget,
    minLease,
    age,
    coApplicantAge,
    cpfOABalance,
    monthlyIncome,
  };

  const canContinueStep = canContinueSearchProfileStep(step, draft);

  const { affordabilityCeiling, affordabilityProfileComplete } = useMemo(() => {
    const profile = {
      monthlyIncome: parseOptionalNumber(monthlyIncome),
      cpfOABalance: parseOptionalNumber(cpfOABalance),
      age: parseOptionalNumber(age),
      coApplicantAge: parseOptionalNumber(coApplicantAge),
    };
    return {
      affordabilityCeiling: maxAffordablePrice(profile),
      affordabilityProfileComplete: isAffordabilityProfileComplete(profile),
    };
  }, [monthlyIncome, cpfOABalance, age, coApplicantAge]);

  const canSubmit = canSubmitSearchProfileDraft(draft);

  const nextLabel = step === totalSteps - 1 ? t("searchProfile.continue") : t("searchProfile.next");

  const handleContinue = () => {
    if (step < totalSteps - 1) {
      setDirection(1);
      setStep((prev) => prev + 1);
      return;
    }

    if (!canSubmit) return;
    onComplete(buildSearchProfileFromWizard(draft));
  };

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onSkip();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[101] flex items-end justify-center overflow-hidden px-4 pb-[calc(var(--mobile-tab-bar-height)+env(safe-area-inset-bottom,0px)+1rem)] pt-4 outline-none lg:items-center lg:px-0 lg:py-6"
        >
          <DialogPrimitive.Title className="sr-only">
            {t("searchProfile.setupTitle")}
          </DialogPrimitive.Title>
          <Card
            data-testid="search-profile-wizard-card"
            className="wizard-panel-in relative flex max-h-[calc(100dvh-6rem)] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-none border bg-popover shadow-sm lg:max-h-[calc(100dvh-3rem)] lg:w-[28.75rem] lg:max-w-[28.75rem]"
          >
            <CardContent
              data-testid="search-profile-wizard-scroll-content"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 lg:px-8 lg:py-7"
            >
              <div
                className="mb-6 flex items-center justify-center gap-1.5"
                role="progressbar"
                aria-label={t("searchProfile.wizard.progress", {
                  current: step + 1,
                  total: totalSteps,
                })}
                aria-valuemin={1}
                aria-valuemax={totalSteps}
                aria-valuenow={step + 1}
              >
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

                  {step === 1 ? (
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
                            aria-label={t("searchProfile.maxBudget")}
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
                              {formatCompactCurrency(preset, locale)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {step === 2 ? (
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
                            aria-label={t("searchProfile.minLease")}
                            inputMode="numeric"
                            enterKeyHint="done"
                            type="number"
                            min={1}
                            max={99}
                            step={1}
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

                  {step === 3 ? (
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
                      <p className="mb-4 border-l-2 border-primary/40 pl-3 text-xs font-semibold leading-5 text-muted-foreground">
                        {t("searchProfile.wizard.affordabilityPrivacy")}
                      </p>
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
                              <span className="pr-2 text-sm font-bold text-muted-foreground">
                                S$
                              </span>
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
                              <span className="pr-2 text-sm font-bold text-muted-foreground">
                                S$
                              </span>
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

                  {step === 4 ? (
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
                            {formatCurrency(Number(maxBudget), locale)}
                          </div>
                        ) : null}
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
                            {t("searchProfile.chip.coApplicantAge", {
                              age: Number(coApplicantAge),
                            })}
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
                      {affordabilityProfileComplete && affordabilityCeiling > 0 ? (
                        <div className="mt-5 rounded-none border border-success/30 bg-success/[0.06] px-4 py-3 text-left">
                          <p className="text-[length:var(--text-xs)] font-extrabold uppercase tracking-[var(--tracking-label)] text-success">
                            {t("affordability.ceiling", {
                              price: formatCurrency(affordabilityCeiling, locale),
                            })}
                          </p>
                          <p className="mt-1 text-[0.75rem] font-semibold leading-snug text-muted-foreground">
                            {t("affordability.summary", {
                              cpf: formatCurrency(Number(cpfOABalance), locale),
                              income: formatCurrency(Number(monthlyIncome), locale),
                              age: Number(age),
                              price: formatCurrency(affordabilityCeiling, locale),
                            })}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
            <div
              data-testid="search-profile-wizard-actions"
              className="shrink-0 border-t bg-popover px-5 pb-4 pt-3 lg:px-8 lg:pb-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
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
                  ) : null}
                  <button
                    type="button"
                    onClick={onSkip}
                    className="px-1 py-2 text-xs font-bold uppercase tracking-[0.06em] text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-none"
                  >
                    {t("searchProfile.skip")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinueStep || (step === totalSteps - 1 && !canSubmit)}
                  className="rounded-none bg-primary px-6 py-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-primary-foreground transition-[box-shadow] enabled:hover:bg-primary/95 disabled:cursor-not-allowed disabled:bg-muted/70 disabled:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {nextLabel}
                </button>
              </div>
            </div>
          </Card>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
