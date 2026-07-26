import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { SearchProfileWizard } from "@/features/search-profile/SearchProfileWizard";
import { I18nProvider } from "@/shared/lib/i18n";
import { maxAffordablePrice } from "@/shared/lib/affordability";
import { formatCurrency } from "@/shared/lib/format";
import { SEARCH_PROFILE_MAX_MONETARY_VALUE } from "@/shared/lib/constants";
import { DEFAULT_SEARCH_PROFILE } from "@/features/search-profile/searchProfile";
import type { FilterOptions } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

const options: FilterOptions = {
  towns: ["BEDOK"],
  flatTypes: ["4 ROOM", "5 ROOM"],
  flatModels: ["Model A"],
};

function renderWizard(onComplete = vi.fn(), onSkip = vi.fn(), initialProfile?: SearchProfile) {
  return render(
    <I18nProvider>
      <SearchProfileWizard
        options={options}
        initialProfile={initialProfile}
        onComplete={onComplete}
        onSkip={onSkip}
      />
    </I18nProvider>,
  );
}

async function clickPrimary(user: ReturnType<typeof userEvent.setup>, label: RegExp | string) {
  await user.click(screen.getByRole("button", { name: label }));
}

describe("SearchProfileWizard", () => {
  it("keeps the form scrollable while pinning actions inside short viewports", () => {
    renderWizard();

    expect(screen.getByTestId("search-profile-wizard-card")).toHaveClass(
      "max-h-[calc(100dvh-6rem)]",
      "overflow-hidden",
    );
    expect(screen.getByTestId("search-profile-wizard-scroll-content")).toHaveClass(
      "min-h-0",
      "overflow-y-auto",
      "overscroll-contain",
    );
    expect(screen.getByTestId("search-profile-wizard-actions")).toHaveClass("shrink-0");
  });

  it("behaves as a modal dialog and dismisses with Escape", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    renderWizard(vi.fn(), onSkip);

    const dialog = screen.getByRole("dialog", { name: "Buyer setup" });
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "4 ROOM" })).toHaveFocus();
    });

    await user.keyboard("{Escape}");
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("calls onSkip from the first preference step", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    renderWizard(vi.fn(), onSkip);

    expect(screen.getByText(/what type of flat/i)).toBeInTheDocument();
    await clickPrimary(user, /skip for now/i);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("exposes the current setup step to assistive technology", async () => {
    const user = userEvent.setup();
    renderWizard();

    const progress = screen.getByRole("progressbar", {
      name: /buyer setup step 1 of 5/i,
    });
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(progress).toHaveAttribute("aria-valuemax", "5");

    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await clickPrimary(user, /next/i);
    expect(screen.getByRole("progressbar", { name: /buyer setup step 2 of 5/i })).toHaveAttribute(
      "aria-valuenow",
      "2",
    );
  });

  it("keeps setup skippable after advancing", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    renderWizard(vi.fn(), onSkip);

    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await clickPrimary(user, /next/i);
    expect(screen.getByText(/what's your budget/i)).toBeInTheDocument();

    await clickPrimary(user, /skip for now/i);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("prefills every retained value when editing an existing profile", async () => {
    const user = userEvent.setup();
    renderWizard(vi.fn(), vi.fn(), {
      ...DEFAULT_SEARCH_PROFILE,
      mainFlatType: "4 ROOM",
      maxBudget: 700_000,
      minimumRemainingLeaseYears: 70,
      age: 35,
      coApplicantAge: 33,
      cpfOABalance: 120_000,
      monthlyIncome: 9_000,
    });

    expect(screen.getByRole("button", { name: "4 ROOM" })).toHaveAttribute("aria-pressed", "true");
    await clickPrimary(user, /next/i);
    expect(screen.getByRole("spinbutton", { name: /max budget/i })).toHaveValue(700_000);
    await clickPrimary(user, /next/i);
    expect(screen.getByRole("spinbutton", { name: /minimum remaining lease/i })).toHaveValue(70);
    await clickPrimary(user, /next/i);
    expect(screen.getByLabelText(/^your age$/i)).toHaveValue(35);
    expect(screen.getByLabelText(/co-applicant age/i)).toHaveValue(33);
    expect(screen.getByLabelText(/cpf oa balance/i)).toHaveValue(120_000);
    expect(screen.getByLabelText(/household monthly income/i)).toHaveValue(9_000);
  });

  it("blocks advancing on the flat-type step until a type is selected", async () => {
    const user = userEvent.setup();
    renderWizard();

    expect(screen.getByText(/what type of flat/i)).toBeInTheDocument();

    const nextButton = screen.getByRole("button", { name: /next/i });
    expect(nextButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    expect(nextButton).not.toBeDisabled();
  });

  it("blocks an out-of-range budget on the budget step", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await clickPrimary(user, /next/i);

    const overMaxBudget = String(SEARCH_PROFILE_MAX_MONETARY_VALUE + 1);
    await user.type(screen.getByRole("spinbutton", { name: /max budget/i }), overMaxBudget);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("completes the wizard with affordability ceiling derived from income, CPF, and age", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderWizard(onComplete);

    const age = 35;
    const monthlyIncome = 9000;
    const cpfOABalance = 120000;
    const expectedCeiling = maxAffordablePrice({
      monthlyIncome,
      cpfOABalance,
      age,
      coApplicantAge: null,
    });
    expect(expectedCeiling).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await clickPrimary(user, /next/i);
    await clickPrimary(user, /next/i);

    await user.click(screen.getByRole("button", { name: /70 yr/i }));
    await clickPrimary(user, /next/i);

    expect(screen.getByText(/stored only in this browser/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^your age$/i), String(age));
    await user.type(screen.getByLabelText(/co-applicant age/i), "33");
    await user.type(screen.getByLabelText(/cpf oa balance/i), String(cpfOABalance));
    await user.type(screen.getByLabelText(/household monthly income/i), String(monthlyIncome));
    await clickPrimary(user, /next/i);

    expect(
      screen.getByText(`Estimated ceiling (excluding cash): ${formatCurrency(expectedCeiling)}`),
    ).toBeInTheDocument();

    await clickPrimary(user, /apply setup/i);

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 3,
        mainFlatType: "4 ROOM",
        minimumRemainingLeaseYears: 70,
        age,
        coApplicantAge: 33,
        cpfOABalance,
        monthlyIncome,
      }),
    );
  });

  it("does not show an affordability ceiling for incomplete financial inputs", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await clickPrimary(user, /next/i);
    await clickPrimary(user, /next/i);
    await user.click(screen.getByRole("button", { name: /70 yr/i }));
    await clickPrimary(user, /next/i);

    await user.type(screen.getByLabelText(/^your age$/i), "35");
    await user.type(screen.getByLabelText(/cpf oa balance/i), "120000");
    await clickPrimary(user, /next/i);

    expect(screen.queryByText(/estimated ceiling/i)).not.toBeInTheDocument();
  });

  it("rejects applicant age below the minimum on the affordability step", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await clickPrimary(user, /next/i);
    await clickPrimary(user, /next/i);

    await user.click(screen.getByRole("button", { name: /70 yr/i }));
    await clickPrimary(user, /next/i);

    const ageInput = screen.getByLabelText(/^your age$/i);
    await user.type(ageInput, "18");
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();

    // Replacing the out-of-range age with a valid one must re-enable the step,
    // proving the age bound — not some other empty field — gated the button.
    await user.clear(ageInput);
    await user.type(ageInput, "25");
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });
});
