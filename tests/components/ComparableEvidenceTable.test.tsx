import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { ComparableEvidenceTable } from "@/components/ComparableEvidenceTable";
import { I18nProvider } from "@/shared/lib/i18n";
import type { ComparableTransaction } from "../../shared/comparable-engine";

function makeTx(
  overrides: Partial<ComparableTransaction> & { transactionId: string },
): ComparableTransaction {
  return {
    transactionId: overrides.transactionId,
    month: overrides.month ?? "2025-01",
    town: overrides.town ?? "ANG MO KIO",
    block: overrides.block ?? "123A",
    streetName: overrides.streetName ?? "ANG MO KIO AVE 1",
    flatType: overrides.flatType ?? "4 ROOM",
    storeyRange: overrides.storeyRange ?? "07 TO 09",
    floorAreaSqm: overrides.floorAreaSqm ?? 93,
    leaseCommenceDate: overrides.leaseCommenceDate ?? 1990,
    resalePrice: overrides.resalePrice ?? 500000,
    pricePerSqm: overrides.pricePerSqm ?? 5376,
    similarity: overrides.similarity ?? 0.8,
    matchReasons: overrides.matchReasons ?? ["Same block"],
  };
}

const FIXTURES: ComparableTransaction[] = [
  makeTx({
    transactionId: "tx-1",
    similarity: 0.95,
    resalePrice: 550000,
    pricePerSqm: 5914,
    month: "2025-03",
    floorAreaSqm: 93,
    matchReasons: ["Same block", "Same flat type"],
  }),
  makeTx({
    transactionId: "tx-2",
    similarity: 0.87,
    resalePrice: 480000,
    pricePerSqm: 5161,
    month: "2025-01",
    floorAreaSqm: 90,
  }),
  makeTx({
    transactionId: "tx-3",
    similarity: 0.72,
    resalePrice: 620000,
    pricePerSqm: 6667,
    month: "2024-11",
    floorAreaSqm: 95,
    matchReasons: ["Same street", "Similar floor area (±2 sqm)"],
  }),
  makeTx({
    transactionId: "tx-4",
    similarity: 0.65,
    resalePrice: 450000,
    pricePerSqm: 4839,
    month: "2024-08",
    floorAreaSqm: 88,
  }),
  makeTx({
    transactionId: "tx-5",
    similarity: 0.5,
    resalePrice: 700000,
    pricePerSqm: 7527,
    month: "2024-05",
    floorAreaSqm: 100,
    matchReasons: ["Same town"],
  }),
];

function renderTable(props?: Partial<Parameters<typeof ComparableEvidenceTable>[0]>) {
  return render(
    <I18nProvider>
      <ComparableEvidenceTable
        comparables={props?.comparables ?? FIXTURES}
        referenceMonth={props?.referenceMonth ?? "2025-04"}
        widenedSearch={props?.widenedSearch ?? false}
        caveats={props?.caveats ?? []}
      />
    </I18nProvider>,
  );
}

describe("ComparableEvidenceTable", () => {
  // ── Column headers ──────────────────────────────────────────────────────

  it("renders all column headers", () => {
    renderTable();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Month")).toBeInTheDocument();
    expect(within(table).getByText("Block / Street")).toBeInTheDocument();
    expect(within(table).getByText("Flat Type")).toBeInTheDocument();
    expect(within(table).getByText("Storey")).toBeInTheDocument();
    expect(within(table).getByText("Area")).toBeInTheDocument();
    expect(within(table).getByText("Lease")).toBeInTheDocument();
    expect(within(table).getByText("Price")).toBeInTheDocument();
    expect(within(table).getByText("$/sqm")).toBeInTheDocument();
    expect(within(table).getByText("Similarity")).toBeInTheDocument();
    expect(within(table).getByText("Match Reasons")).toBeInTheDocument();
  });

  // ── Mobile card branch (R3.1 / R3.2) ──────────────────────────────────────

  it("renders comparable evidence as mobile cards with the required fields", () => {
    renderTable();
    // The mobile layout renders one <article> card per comparable (the desktop
    // <table> is hidden below the `sm` breakpoint via CSS).
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(FIXTURES.length);

    // Cards follow the same default sort as the table (similarity desc), so the
    // first card is tx-1. Assert the minimum interpretation fields are present:
    // month, area, block/street, flat type, storey, lease, and match reasons.
    const first = cards[0];
    expect(first).toHaveTextContent("2025"); // month
    expect(first).toHaveTextContent("123A"); // block
    expect(first).toHaveTextContent("ANG MO KIO AVE 1"); // street
    expect(first).toHaveTextContent("4 ROOM"); // flat type
    expect(first).toHaveTextContent("07 TO 09"); // storey
    expect(first).toHaveTextContent("93"); // floor area (sqm)
    expect(first).toHaveTextContent("1990"); // lease commence year
    expect(first).toHaveTextContent("Same flat type"); // match reason
  });

  // ── Row count ───────────────────────────────────────────────────────────

  it("renders correct number of rows", () => {
    renderTable();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // 1 header row + 5 data rows
    expect(rows).toHaveLength(6);
  });

  // ── Default sort (similarity descending) ────────────────────────────────

  it("defaults to similarity descending — first row has highest similarity", () => {
    renderTable();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // First data row (index 1) should contain 95% (highest similarity)
    expect(rows[1]).toHaveTextContent("95%");
  });

  // ── Sort by price ───────────────────────────────────────────────────────

  it("sorts by price descending on first click", async () => {
    const user = userEvent.setup();
    renderTable();

    const table = screen.getByRole("table");
    const priceButton = within(table).getByRole("button", { name: /price/i });
    await user.click(priceButton);

    const rows = within(table).getAllByRole("row");
    // tx-5 has highest price ($700K), should be first data row
    expect(rows[1]).toHaveTextContent("700");
  });

  it("toggles to ascending on second click", async () => {
    const user = userEvent.setup();
    renderTable();

    const table = screen.getByRole("table");
    const priceButton = within(table).getByRole("button", { name: /price/i });
    await user.click(priceButton);
    await user.click(priceButton);

    const rows = within(table).getAllByRole("row");
    // tx-4 has lowest price ($450K), should be first data row
    expect(rows[1]).toHaveTextContent("450");
  });

  // ── Sort by month ───────────────────────────────────────────────────────

  it("sorts by month ascending on click", async () => {
    const user = userEvent.setup();
    renderTable();

    const table = screen.getByRole("table");
    const monthButton = within(table).getByRole("button", { name: /month/i });
    await user.click(monthButton);

    const rows = within(table).getAllByRole("row");
    // tx-5 has earliest month (2024-05), should be first
    expect(rows[1]).toHaveTextContent("May 2024");
  });

  // ── Empty state ─────────────────────────────────────────────────────────

  it("shows empty state when no comparables", () => {
    renderTable({ comparables: [] });
    expect(screen.getByText(/no comparable transactions found/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  // ── Caveats ─────────────────────────────────────────────────────────────

  it("shows caveat banner when caveats are non-empty", () => {
    renderTable({
      caveats: ["Only 3 comparable transactions found — this assessment is directional only."],
    });
    expect(screen.getByText(/only 3 comparable/i)).toBeInTheDocument();
  });

  it("does not show caveat banner when caveats are empty", () => {
    renderTable({ caveats: [] });
    expect(screen.queryByText(/directional only/i)).not.toBeInTheDocument();
  });

  // ── Similarity display ──────────────────────────────────────────────────

  it("displays similarity as percentage (0.87 → 87%)", () => {
    renderTable();
    expect(screen.getAllByText("87%").length).toBeGreaterThanOrEqual(1);
  });

  // ── Match reasons ───────────────────────────────────────────────────────

  it("renders match reason badges", () => {
    renderTable();
    expect(screen.getAllByText("Same block").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Same flat type").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Same street").length).toBeGreaterThanOrEqual(1);
  });

  // ── "Why these comparables?" explainer ──────────────────────────────────

  it("shows non-widened explainer when widenedSearch is false", async () => {
    const user = userEvent.setup();
    renderTable({ widenedSearch: false });

    const whyButton = screen.getByRole("button", { name: /why these comparables/i });
    await user.click(whyButton);

    expect(
      screen.getByText(/most similar recent transactions in the same block/i),
    ).toBeInTheDocument();
  });

  it("shows widened explainer when widenedSearch is true", async () => {
    const user = userEvent.setup();
    renderTable({ widenedSearch: true });

    const whyButton = screen.getByRole("button", { name: /why these comparables/i });
    await user.click(whyButton);

    expect(screen.getByText(/widened to the same street or town/i)).toBeInTheDocument();
  });

  it("shows low-sample note when fewer than 5 comparables", async () => {
    const user = userEvent.setup();
    renderTable({ comparables: FIXTURES.slice(0, 3) });

    const whyButton = screen.getByRole("button", { name: /why these comparables/i });
    await user.click(whyButton);

    expect(screen.getByText(/very few comparable/i)).toBeInTheDocument();
  });

  // ── Accessibility ───────────────────────────────────────────────────────

  it("sets aria-sort on active sort column", () => {
    renderTable();
    const simHeader = screen.getByRole("columnheader", { name: /similarity/i });
    expect(simHeader).toHaveAttribute("aria-sort", "descending");

    const monthHeader = screen.getByRole("columnheader", { name: /month/i });
    expect(monthHeader).toHaveAttribute("aria-sort", "none");
  });

  // ── Mobile cards ────────────────────────────────────────────────────────

  it("renders mobile card articles", () => {
    renderTable();
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(FIXTURES.length);
  });

  // ── Mobile sort controls ───────────────────────────────────────────────

  it("renders mobile sort pill buttons for all sortable columns", () => {
    renderTable();
    const sortButtons = screen.getAllByRole("button", { pressed: false });
    const activeButtons = screen.getAllByRole("button", { pressed: true });
    // 5 sort keys total: 1 active (similarity) + 4 inactive
    expect(activeButtons).toHaveLength(1);
    expect(activeButtons[0]).toHaveTextContent(/similarity/i);
    // Other sort pills exist (month, price, $/sqm, area)
    const pillLabels = sortButtons.map((b) => b.textContent?.toLowerCase() ?? "");
    expect(pillLabels.some((l) => l.includes("month"))).toBe(true);
    expect(pillLabels.some((l) => l.includes("price"))).toBe(true);
    expect(pillLabels.some((l) => l.includes("area"))).toBe(true);
  });

  it("mobile sort button changes sort order", async () => {
    const user = userEvent.setup();
    renderTable();

    // Find the mobile Price sort button (aria-pressed)
    const pricePills = screen
      .getAllByRole("button")
      .filter(
        (b) =>
          b.textContent?.toLowerCase().includes("price") && b.getAttribute("aria-pressed") !== null,
      );
    expect(pricePills.length).toBeGreaterThanOrEqual(1);
    await user.click(pricePills[0]);

    // After clicking Price, the desktop table first row should have highest price
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("700");
  });
});
