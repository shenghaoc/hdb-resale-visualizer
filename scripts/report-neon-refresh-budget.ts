import {
  ESTIMATED_COLD_BOOTSTRAP_BYTES,
  ESTIMATED_RECONCILIATION_BYTES,
  NEON_MONTHLY_TRANSFER_LIMIT_BYTES,
  PROPOSED_TRANSFER_RESERVE_BYTES,
  estimateMonthlyNeonTransfer,
} from "./lib/sync/refresh-policy";

console.log(
  JSON.stringify(
    {
      mode: "local-estimate-only",
      monthlyLimitBytes: NEON_MONTHLY_TRANSFER_LIMIT_BYTES,
      proposedReserveBytes: PROPOSED_TRANSFER_RESERVE_BYTES,
      reconciliationProxyBytes: ESTIMATED_RECONCILIATION_BYTES,
      coldBootstrapProxyBytes: ESTIMATED_COLD_BOOTSTRAP_BYTES,
      scenarios: [
        estimateMonthlyNeonTransfer(),
        estimateMonthlyNeonTransfer({ coldBootstrapEquivalents: 100 }),
        estimateMonthlyNeonTransfer({ coldBootstrapEquivalents: 200 }),
        estimateMonthlyNeonTransfer({ manualReconciliations: 1, coldBootstrapEquivalents: 200 }),
        estimateMonthlyNeonTransfer({ manualReconciliations: 2, coldBootstrapEquivalents: 200 }),
      ],
      limitation:
        "Transfer proxies exclude other queries, projects, retries, failed attempts and traffic. This is not a live quota check or authorization to refresh.",
    },
    null,
    2,
  ),
);
