import { memo } from "react";
import { Sparkles } from "lucide-react";
import { formatCompactCurrency, formatNumber } from "@/shared/lib/format";
import type { Locale, Translator } from "@/shared/lib/i18n";
import { localizeTownName } from "@/shared/lib/i18n/domain";
import type { TownRecommendation } from "@/features/search-profile/town-recommendations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type TownRecommendationsSectionProps = {
  recommendations: ReadonlyArray<TownRecommendation>;
  isLoading: boolean;
  onSelectTown: (town: string) => void;
  t: Translator;
  locale: Locale;
};

export const TownRecommendationsSection = memo(function TownRecommendationsSection({
  recommendations,
  isLoading,
  onSelectTown,
  t,
  locale,
}: TownRecommendationsSectionProps) {
  if (isLoading) {
    return (
      <section
        aria-labelledby="town-recommendations-title"
        data-testid="town-recommendations"
        className="flex flex-col gap-3"
      >
        <header className="flex items-center gap-2">
          <Sparkles data-icon className="size-4 text-primary" aria-hidden="true" />
          <h2
            id="town-recommendations-title"
            className="text-[0.75rem] font-extrabold uppercase tracking-[var(--tracking-label)] text-foreground"
          >
            {t("townRecommendations.title")}
          </h2>
        </header>
        <p className="text-xs text-muted-foreground">{t("townRecommendations.loading")}</p>
      </section>
    );
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="town-recommendations-title"
      data-testid="town-recommendations"
      className="flex flex-col gap-3"
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Sparkles data-icon className="size-4 text-primary" aria-hidden="true" />
          <h2
            id="town-recommendations-title"
            className="text-[0.75rem] font-extrabold uppercase tracking-[var(--tracking-label)] text-foreground"
          >
            {t("townRecommendations.title")}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">{t("townRecommendations.subtitle")}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {recommendations.map((rec) => {
          const matchedCount = rec.strongCount + rec.goodCount + rec.stretchCount;
          return (
            <li key={rec.town}>
              <Card className="border-border/40 bg-card shadow-none">
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate font-heading text-sm font-extrabold uppercase tracking-wider">
                      {localizeTownName(rec.town, locale)}
                    </strong>
                    <span className="block text-[0.75rem] text-muted-foreground">
                      {t("townRecommendations.matchCount", {
                        matched: formatNumber(matchedCount, 0, locale),
                        total: formatNumber(rec.totalBlocks, 0, locale),
                      })}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-heading text-sm font-extrabold v2-tabular">
                      {formatCompactCurrency(rec.medianPrice, locale)}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[length:var(--text-xs)] font-bold uppercase tracking-wider"
                    >
                      {t("townRecommendations.townMedian")}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => onSelectTown(rec.town)}
                    aria-label={t("townRecommendations.exploreAria", {
                      town: localizeTownName(rec.town, locale),
                    })}
                  >
                    {t("townRecommendations.explore")}
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
