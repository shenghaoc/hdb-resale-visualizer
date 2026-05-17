import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FilterOptions } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

type Props = {
  options: FilterOptions;
  onComplete: (profile: SearchProfile) => void;
};

export function SearchProfileWizard({ options, onComplete }: Props) {
  const [mainFlatType, setMainFlatType] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [commuteAnchorLabel, setCommuteAnchorLabel] = useState("");
  const [maxCommute, setMaxCommute] = useState("");
  const [minLease, setMinLease] = useState("");

  const canSubmit = useMemo(
    () =>
      mainFlatType.length > 0 &&
      Number(maxBudget) > 0 &&
      commuteAnchorLabel.trim().length > 0 &&
      Number(maxCommute) > 0 &&
      Number(minLease) > 0,
    [commuteAnchorLabel, mainFlatType, maxBudget, maxCommute, minLease],
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl items-center p-4 sm:p-6 lg:p-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Set up your search profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Main target flat type</label>
            <Select value={mainFlatType} onValueChange={setMainFlatType}>
              <SelectTrigger><SelectValue placeholder="Select flat type" /></SelectTrigger>
              <SelectContent>
                {options.flatTypes.map((flatType) => (
                  <SelectItem key={flatType} value={flatType}>{flatType}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Max budget (SGD)</label>
            <Input inputMode="numeric" type="number" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Main commute destination / preferred MRT station</label>
            <Input value={commuteAnchorLabel} onChange={(e) => setCommuteAnchorLabel(e.target.value)} placeholder="e.g. Raffles Place MRT" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Max comfortable commute (minutes)</label>
            <Input inputMode="numeric" type="number" value={maxCommute} onChange={(e) => setMaxCommute(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Minimum remaining lease (years)</label>
            <Input inputMode="numeric" type="number" value={minLease} onChange={(e) => setMinLease(e.target.value)} />
          </div>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onComplete({
                version: 1,
                mainFlatType,
                alternativeFlatTypes: [],
                maxBudget: Number(maxBudget),
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
            Continue to map
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
