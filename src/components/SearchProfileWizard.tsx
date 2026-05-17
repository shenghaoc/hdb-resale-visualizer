import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
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
  const [maxCommute, setMaxCommute] = useState("");
  const [minLease, setMinLease] = useState("");

  const canSubmit = useMemo(
    () =>
      mainFlatType.length > 0 &&
      commuteAnchorLabel.trim().length > 0 &&
      Number(maxCommute) > 0 &&
      Number(minLease) > 0,
    [commuteAnchorLabel, mainFlatType, maxCommute, minLease],
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center p-4 sm:p-6 lg:p-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t("searchProfile.wizard.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">{t("searchProfile.mainFlatType")}</label>
            <Select value={mainFlatType} onValueChange={setMainFlatType}>
              <SelectTrigger><SelectValue placeholder={t("searchProfile.selectFlatType")} /></SelectTrigger>
              <SelectContent>
                {options.flatTypes.map((flatType) => (
                  <SelectItem key={flatType} value={flatType}>{flatType}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">{t("searchProfile.maxBudget")}</label>
            <Input inputMode="numeric" type="number" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">{t("searchProfile.commuteAnchor")}</label>
            <Input value={commuteAnchorLabel} onChange={(e) => setCommuteAnchorLabel(e.target.value)} placeholder={t("searchProfile.commuteAnchorPlaceholder")} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">{t("searchProfile.maxCommute")}</label>
            <Input inputMode="numeric" type="number" value={maxCommute} onChange={(e) => setMaxCommute(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">{t("searchProfile.minLease")}</label>
            <Input inputMode="numeric" type="number" value={minLease} onChange={(e) => setMinLease(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canSubmit}
              onClick={() =>
                onComplete({
                  version: 1,
                  mainFlatType,
                  alternativeFlatTypes: [],
                  maxBudget: maxBudget ? Number(maxBudget) : null,
                  commuteAnchorLabel: commuteAnchorLabel.trim(),
                  commuteAnchorMrt: null,
                  maxComfortableCommuteMinutes: Number(maxCommute),
                  commuteStretchMinutes: 10,
                  minimumRemainingLeaseYears: Number(minLease),
                  budgetStretchPercent: 5,
                  showStretchOptions: true,
                  showAllBlocks: false,
                })
              }
            >
              {t("searchProfile.continue")}
            </Button>
            <Button variant="ghost" onClick={onSkip}>
              {t("searchProfile.skip")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
