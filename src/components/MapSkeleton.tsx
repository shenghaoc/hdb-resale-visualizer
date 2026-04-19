export function MapSkeleton() {
  return (
    <div className="map-view map-skeleton" data-testid="map-view" aria-busy="true">
      <div className="skeleton-shimmer" />
      <span className="skeleton-label">Loading map…</span>
    </div>
  );
}
