import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function SearchProfileWizard({ options, onComplete, onSkip }: Props) {
  const { t } = useI18n();
  const [mainFlatType, setMainFlatType] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [commuteAnchorLabel, setCommuteAnchorLabel] = useState("");
  const [commuteAnchorMrt, setCommuteAnchorMrt] = useState("");
  const [maxCommute, setMaxCommute] = useState("");
  const [minLease, setMinLease] = useState("");
  const [step, setStep] = useState(0);
  const [stationSearch, setStationSearch] = useState("");
  const [stationPickerOpen, setStationPickerOpen] = useState(false);
  const mrtStations = useMemo(() => getKnownMrtStationNames(), []);
  const budgetPresets = [500000, 700000, 900000, 1200000];
  const commutePresets = [20, 30, 40, 50];
  const leasePresets = [50, 60, 70, 80];
  const totalSteps = 5;
  const filteredStations = useMemo(() => {
    const query = stationSearch.trim().toUpperCase();
    if (!query) return mrtStations;
    return mrtStations.filter((station) => station.includes(query));
  }, [mrtStations, stationSearch]);

  const canContinueStep = useMemo(() => {
    if (step === 0) return mainFlatType.length > 0;
    if (step === 1) return maxBudget.trim().length === 0 || Number(maxBudget) > 0;
    if (step === 2) return commuteAnchorLabel.trim().length > 0 && commuteAnchorMrt.length > 0;
    if (step === 3) return Number(maxCommute) > 0;
    if (step === 4) return Number(minLease) > 0;
    return false;
  }, [commuteAnchorLabel, commuteAnchorMrt, mainFlatType, maxBudget, maxCommute, minLease, step]);

  const canSubmit = useMemo(
    () =>
      mainFlatType.length > 0 &&
      (maxBudget.trim().length === 0 || Number(maxBudget) > 0) &&
      commuteAnchorLabel.trim().length > 0 &&
      commuteAnchorMrt.length > 0 &&
      Number(maxCommute) > 0 &&
      Number(minLease) > 0,
    [commuteAnchorLabel, commuteAnchorMrt, mainFlatType, maxBudget, maxCommute, minLease],
  );

  const stepTitle = useMemo(() => {
    if (step === 0) return t("searchProfile.wizard.step.flatType");
    if (step === 1) return t("searchProfile.wizard.step.budget");
    if (step === 2) return t("searchProfile.wizard.step.commuteAnchor");
    if (step === 3) return t("searchProfile.wizard.step.commuteTime");
    return t("searchProfile.wizard.step.lease");
  }, [step, t]);

  const handleContinue = () => {
    if (step < totalSteps - 1) {
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
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(8,145,178,0.2),transparent_45%),radial-gradient(circle_at_80%_15%,rgba(2,132,199,0.18),transparent_42%),linear-gradient(to_bottom,rgba(15,23,42,0.08),transparent_35%)] dark:bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.22),transparent_45%),radial-gradient(circle_at_80%_15%,rgba(14,165,233,0.18),transparent_42%),linear-gradient(to_bottom,rgba(2,6,23,0.52),transparent_35%)]" />
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl items-center">
        <Card className="relative w-full border-border/60 bg-background/90 shadow-2xl backdrop-blur-xl">
          <CardHeader className="gap-4 border-b border-border/50 pb-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary">
                  {t("searchProfile.wizard.kicker")}
                </p>
                <CardTitle className="text-2xl">{t("searchProfile.wizard.title")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("searchProfile.wizard.subtitle")}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
                {t("searchProfile.skip")}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {stepTitle}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  {t("searchProfile.wizard.stepCounter", { current: step + 1, total: totalSteps })}
                </p>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: totalSteps }).map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "h-1.5 rounded-full transition-colors",
                      index <= step ? "bg-primary" : "bg-muted",
                    )}
                  />
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 py-6">
            {step === 0 && (
              <div className="space-y-3">
                <label className="text-sm font-medium">{t("searchProfile.mainFlatType")}</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {options.flatTypes.map((flatType) => {
                    const selected = mainFlatType === flatType;
                    return (
                      <button
                        key={flatType}
                        type="button"
                        onClick={() => setMainFlatType(flatType)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/30 text-foreground hover:bg-muted",
                        )}
                      >
                        {flatType}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <label className="text-sm font-medium">{t("searchProfile.maxBudget")}</label>
                <Input
                  inputMode="numeric"
                  type="number"
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(e.target.value)}
                  placeholder={t("searchProfile.maxBudgetPlaceholder")}
                />
                <div className="flex flex-wrap gap-2">
                  {budgetPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMaxBudget(String(preset))}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      S${preset.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("searchProfile.commuteDestination")}</label>
                  <Input
                    value={commuteAnchorLabel}
                    onChange={(e) => setCommuteAnchorLabel(e.target.value)}
                    placeholder={t("searchProfile.commuteAnchorPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("searchProfile.commuteMrtStation")}</label>
                  <Popover open={stationPickerOpen} onOpenChange={setStationPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between px-3 normal-case tracking-normal"
                      >
                        <span className={commuteAnchorMrt ? "text-foreground" : "text-muted-foreground"}>
                          {commuteAnchorMrt || t("searchProfile.selectMrtStation")}
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="z-[70] w-[min(24rem,calc(100vw-2rem))] gap-3 p-3" align="start">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={stationSearch}
                          onChange={(e) => setStationSearch(e.target.value)}
                          placeholder={t("searchProfile.searchMrtStation")}
                          className="pl-9"
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto border border-border/60">
                        {filteredStations.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-muted-foreground">
                            {t("searchProfile.noMrtStationFound")}
                          </p>
                        ) : (
                          filteredStations.slice(0, 80).map((station) => (
                            <button
                              key={station}
                              type="button"
                              onClick={() => {
                                setCommuteAnchorMrt(station);
                                setStationPickerOpen(false);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              <span>{station}</span>
                              {commuteAnchorMrt === station ? <Check className="size-4 text-primary" /> : null}
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <label className="text-sm font-medium">{t("searchProfile.maxCommute")}</label>
                <Input
                  inputMode="numeric"
                  type="number"
                  value={maxCommute}
                  onChange={(e) => setMaxCommute(e.target.value)}
                  placeholder={t("searchProfile.maxCommutePlaceholder")}
                />
                <div className="flex flex-wrap gap-2">
                  {commutePresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMaxCommute(String(preset))}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {t("searchProfile.minutesPreset", { value: preset })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <label className="text-sm font-medium">{t("searchProfile.minLease")}</label>
                <Input
                  inputMode="numeric"
                  type="number"
                  value={minLease}
                  onChange={(e) => setMinLease(e.target.value)}
                  placeholder={t("searchProfile.minLeasePlaceholder")}
                />
                <div className="flex flex-wrap gap-2">
                  {leasePresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMinLease(String(preset))}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {t("searchProfile.yearsPreset", { value: preset })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                disabled={step === 0}
              >
                <ChevronLeft className="size-4" />
                {t("searchProfile.back")}
              </Button>
              <Button type="button" onClick={handleContinue} disabled={!canContinueStep || (!canSubmit && step === 4)}>
                {step === totalSteps - 1 ? t("searchProfile.continue") : t("searchProfile.next")}
                {step < totalSteps - 1 ? <ChevronRight className="size-4" /> : null}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
