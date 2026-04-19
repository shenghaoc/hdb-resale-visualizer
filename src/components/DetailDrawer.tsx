import { Suspense, lazy } from "react";
import { formatCurrency, formatMeters, formatMonth, formatNumber, formatRemainingLease } from "@/lib/format";
import type { AddressDetail } from "@/types/data";

const TrendChart = lazy(() =>
  import("./TrendChart").then((m) => ({ default: m.TrendChart }))
);

type DetailDrawerProps = {
  detail: AddressDetail | null;
  isLoading: boolean;
  isSaved: boolean;
  onClose: () => void;
  onToggleShortlist: () => void;
};

export function DetailDrawer({
  detail,
  isLoading,
  isSaved,
  onClose,
  onToggleShortlist,
}: DetailDrawerProps) {
  return (
    <aside
      className={`detail-drawer ${detail || isLoading ? "detail-drawer--open" : ""}`}
      data-testid="detail-drawer"
    >
      <div className="detail-drawer__header">
        <div>
          <span className="eyebrow">Selected block</span>
          <h2>
            {detail ? `${detail.summary.block} ${detail.summary.streetName}` : "Loading details"}
          </h2>
          <p>{detail?.summary.town ?? "Fetching block-level trend and recent transactions."}</p>
        </div>
        <button className="button button--ghost" onClick={onClose} type="button">
          Close
        </button>
      </div>

      {isLoading && <p className="empty-state">Loading block detail...</p>}

      {!isLoading && detail ? (
        <div className="detail-drawer__body">
          <div className="detail-grid">
            <article>
              <span>Median price</span>
              <strong>{formatCurrency(detail.summary.medianPrice)}</strong>
            </article>
            <article>
              <span>Price IQR</span>
              <strong>
                {formatCurrency(detail.summary.priceIqr[0])} to{" "}
                {formatCurrency(detail.summary.priceIqr[1])}
              </strong>
            </article>
            <article>
              <span>Floor area</span>
              <strong>
                {formatNumber(detail.summary.floorAreaRange[0], 1)} to{" "}
                {formatNumber(detail.summary.floorAreaRange[1], 1)} sqm
              </strong>
            </article>
            <article>
              <span>Remaining lease</span>
              <strong>
                {formatRemainingLease(detail.summary.leaseCommenceRange)}
              </strong>
            </article>
            <article>
              <span>Nearest MRT</span>
              <strong>
                {detail.summary.nearestMrt
                  ? `${detail.summary.nearestMrt.stationName} • ${formatMeters(
                      detail.summary.nearestMrt.distanceMeters,
                    )}`
                  : "No station match"}
              </strong>
            </article>
          </div>

          <div className="detail-actions">
            <button className="button" onClick={onToggleShortlist} type="button">
              {isSaved ? "Remove from shortlist" : "Add to shortlist"}
            </button>
            <a
              className="button button--ghost"
              href={`https://www.onemap.gov.sg/?lat=${detail.summary.coordinates.lat}&lng=${detail.summary.coordinates.lng}`}
              rel="noreferrer"
              target="_blank"
            >
              Open in OneMap
            </a>
          </div>

          <section className="panel panel--inner">
            <div className="panel__header">
              <div>
                <span className="eyebrow">12 to 24 month trend</span>
                <h3>Monthly median</h3>
              </div>
              <span className="pill">{detail.monthlyTrend.length} months</span>
            </div>
            <Suspense fallback={<div className="empty-state">Loading chart engine...</div>}>
              <TrendChart points={detail.monthlyTrend.slice(-24)} />
            </Suspense>
          </section>

          <section className="panel panel--inner">
            <div className="panel__header">
              <div>
                <span className="eyebrow">Recent evidence</span>
                <h3>Latest transactions</h3>
              </div>
            </div>
            <div className="detail-transactions">
              {detail.recentTransactions.slice(0, 8).map((transaction) => (
                <article key={transaction.id}>
                  <header>
                    <strong>{formatCurrency(transaction.resalePrice)}</strong>
                    <span>{formatMonth(transaction.month)}</span>
                  </header>
                  <p>
                    {transaction.flatType} • {transaction.floorAreaSqm} sqm •{" "}
                    {transaction.storeyRange}
                  </p>
                  <p>
                    {transaction.flatModel} • Lease {transaction.leaseCommenceDate}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
