import { useI18n } from "@/shared/lib/i18n";

export function MapSkeleton() {
  const { t } = useI18n();

  return (
    <div className="map-view map-skeleton" data-testid="map-skeleton" aria-busy="true">
      <div className="skeleton-shimmer" />
      <span className="skeleton-label">{t("map.loading")}</span>
    </div>
  );
}
