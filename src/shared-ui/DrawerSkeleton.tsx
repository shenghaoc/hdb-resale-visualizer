type DrawerSkeletonProps = {
  label?: string;
};

export function DrawerSkeleton({ label = "Loading…" }: DrawerSkeletonProps) {
  return (
    <div className="drawer-skeleton">
      <div className="skeleton-shimmer" />
      <span className="skeleton-label">{label}</span>
    </div>
  );
}
