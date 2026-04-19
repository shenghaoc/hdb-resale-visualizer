import { Download, Link2, Target, TrainFront, X } from "lucide-react";
import { formatCompactCurrency, formatCurrency, formatMeters, formatNumber } from "@/lib/format";
import { encodeShortlistForUrl } from "@/lib/shortlist";
import type { BlockSummary, ShortlistItem } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

type ShortlistRow = {
  item: ShortlistItem;
  summary: BlockSummary;
};

type ShortlistDrawerProps = {
  isOpen: boolean;
  rows: ShortlistRow[];
  onToggleOpen: () => void;
  onRemove: (addressKey: string) => void;
  onUpdate: (addressKey: string, patch: Partial<ShortlistItem>) => void;
};

type GapInfo = {
  amount: number;
  label: string;
  tone: "positive" | "negative";
};

function getGapInfo(targetPrice: number | null, medianPrice: number): GapInfo | null {
  if (targetPrice === null) {
    return null;
  }

  const amount = Math.abs(targetPrice - medianPrice);

  if (targetPrice >= medianPrice) {
    return {
      amount,
      label: "Median is below your target",
      tone: "positive",
    };
  }

  return {
    amount,
    label: "Median is above your target",
    tone: "negative",
  };
}

function getRemainingLeaseRange(leaseCommenceRange: [number, number]) {
  const currentYear = new Date().getFullYear();
  const oldestRemaining = Math.max(0, 99 - (currentYear - leaseCommenceRange[0]));
  const newestRemaining = Math.max(0, 99 - (currentYear - leaseCommenceRange[1]));

  return [Math.min(oldestRemaining, newestRemaining), Math.max(oldestRemaining, newestRemaining)];
}

export function ShortlistDrawer({
  isOpen,
  rows,
  onToggleOpen,
  onRemove,
  onUpdate,
}: ShortlistDrawerProps) {
  function handleShare() {
    const params = new URLSearchParams(window.location.search);
    params.set("shortlist", encodeShortlistForUrl(rows.map((row) => row.item)));
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    void navigator.clipboard.writeText(url);
    alert("Share URL copied to clipboard!");
  }

  function handleExportCsv() {
    const headers = ["Address", "Median Price", "Target Price", "Notes"];
    const csvRows = rows.map((row) =>
      [
        `"${row.summary.block} ${row.summary.streetName}"`,
        row.summary.medianPrice,
        row.item.targetPrice ?? "",
        `"${(row.item.notes || "").replace(/"/g, '""')}"`,
      ].join(","),
    );
    const csvContent = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hdb-shortlist.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportJson() {
    const data = rows.map((r) => r.item);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hdb-shortlist.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section data-testid="shortlist-drawer">
      <Card className="bg-background">
        <CardHeader className="gap-4 border-b border-border pb-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Badge variant="secondary">Browser-only saved homes</Badge>
              <CardTitle className="text-2xl">Shortlist compare</CardTitle>
              <CardDescription>
                Your target price is your own buy threshold for the block. The gap compares that
                number against the current market median.
              </CardDescription>
            </div>
            <CardAction className="flex flex-col items-end gap-3">
              <Badge>{rows.length}/4 saved</Badge>
              <Button onClick={onToggleOpen} size="sm" variant="ghost" type="button">
                {isOpen ? "Collapse" : "Expand"}
              </Button>
            </CardAction>
          </div>
          {rows.length > 0 ? (
            <ButtonGroup className="flex-wrap gap-2 [&>*]:rounded-none [&>*]:border">
              <Button variant="outline" size="xs" onClick={handleExportJson} type="button">
                <Download data-icon="inline-start" />
                JSON
              </Button>
              <Button variant="outline" size="xs" onClick={handleExportCsv} type="button">
                <Download data-icon="inline-start" />
                CSV
              </Button>
              <Button variant="outline" size="xs" onClick={handleShare} type="button">
                <Link2 data-icon="inline-start" />
                Share link
              </Button>
            </ButtonGroup>
          ) : null}
        </CardHeader>

        {isOpen ? (
          <CardContent className="pt-6">
            {rows.length === 0 ? (
              <div className="empty-state">
                Save up to four blocks to compare price, lease context, and MRT access side by side.
              </div>
            ) : (
              <ScrollArea className="max-h-[72vh] pr-3">
                <div className="flex flex-col gap-4">
                  {rows.map((row) => {
                    const gapInfo = getGapInfo(row.item.targetPrice, row.summary.medianPrice);
                    const remainingLeaseRange = getRemainingLeaseRange(
                      row.summary.leaseCommenceRange,
                    );

                    return (
                      <Card key={row.item.addressKey} size="sm" className="bg-muted/40">
                        <CardHeader className="gap-3 border-b border-border/60 pb-5">
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="flex flex-1 flex-col gap-2">
                              <CardTitle className="text-lg">
                                {row.summary.block} {row.summary.streetName}
                              </CardTitle>
                              <CardDescription className="text-xs uppercase tracking-[0.18em]">
                                {row.summary.town}
                              </CardDescription>
                            </div>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => onRemove(row.item.addressKey)}
                              type="button"
                            >
                              <X data-icon="inline-start" />
                              Remove
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5 pt-5">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-2">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Market median
                              </span>
                              <strong className="font-heading text-2xl font-semibold">
                                {formatCompactCurrency(row.summary.medianPrice)}
                              </strong>
                              <span className="text-sm text-muted-foreground">
                                {formatCurrency(row.summary.medianPrice)}
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Price / sqft
                              </span>
                              <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                {row.summary.pricePerSqftMedian !== null
                                  ? formatCurrency(row.summary.pricePerSqftMedian)
                                  : "N/A"}
                              </strong>
                              <span className="text-sm text-muted-foreground">
                                {formatNumber(row.summary.pricePerSqmMedian)} / sqm
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Area range
                              </span>
                              <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                {formatNumber(row.summary.floorAreaRange[0], 1)} to{" "}
                                {formatNumber(row.summary.floorAreaRange[1], 1)} sqm
                              </strong>
                              <span className="text-sm text-muted-foreground">
                                {row.summary.flatTypes.join(", ")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Lease context
                              </span>
                              <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                {remainingLeaseRange[0]} to {remainingLeaseRange[1]} yrs left
                              </strong>
                              <span className="text-sm text-muted-foreground">
                                Commence {row.summary.leaseCommenceRange[0]} to{" "}
                                {row.summary.leaseCommenceRange[1]}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-2">
                              <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                <TrainFront className="size-3.5" />
                                Nearest MRT
                              </span>
                              <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                {row.summary.nearestMrt
                                  ? `${row.summary.nearestMrt.stationName} • ${formatMeters(row.summary.nearestMrt.distanceMeters)}`
                                  : "No match"}
                              </strong>
                            </div>
                            <div className="flex flex-col gap-2">
                              <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                <Target className="size-3.5" />
                                Gap vs target
                              </span>
                              {gapInfo ? (
                                <>
                                  <strong className={gapInfo.tone === "positive" ? "text-emerald-700" : "text-rose-700"}>
                                    {formatCurrency(gapInfo.amount)}
                                  </strong>
                                  <span className="text-sm text-muted-foreground">{gapInfo.label}</span>
                                </>
                              ) : (
                                <span className="text-sm text-muted-foreground">Enter a target to compare.</span>
                              )}
                            </div>
                          </div>

                          <FieldGroup>
                            <Field>
                              <FieldContent>
                                <FieldLabel htmlFor={`target-${row.item.addressKey}`}>Your target price</FieldLabel>
                                <FieldDescription>Your personal max or goal price.</FieldDescription>
                                <InputGroup>
                                  <InputGroupAddon align="inline-start">
                                    <InputGroupText>SGD</InputGroupText>
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    id={`target-${row.item.addressKey}`}
                                    inputMode="numeric"
                                    placeholder="850000"
                                    type="number"
                                    value={row.item.targetPrice ?? ""}
                                    onChange={(event) =>
                                      onUpdate(row.item.addressKey, {
                                        targetPrice:
                                          event.target.value === "" ? null : Number(event.target.value),
                                      })
                                    }
                                  />
                                </InputGroup>
                              </FieldContent>
                            </Field>
                            <Field>
                              <FieldContent>
                                <FieldLabel htmlFor={`notes-${row.item.addressKey}`}>
                                  Notes
                                </FieldLabel>
                                <FieldDescription>
                                  Why this block stays in the running.
                                </FieldDescription>
                                <Textarea
                                  id={`notes-${row.item.addressKey}`}
                                  placeholder="Why this block stays in the running"
                                  rows={3}
                                  value={row.item.notes}
                                  onChange={(event) =>
                                    onUpdate(row.item.addressKey, {
                                      notes: event.target.value,
                                    })
                                  }
                                />
                              </FieldContent>
                            </Field>
                          </FieldGroup>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        ) : null}
      </Card>
    </section>
  );
}
