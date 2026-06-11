import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { SearchProfileWizard } from "@/components/SearchProfileWizard";
import { I18nProvider } from "@/shared/lib/i18n";
import { maxAffordablePrice } from "@/shared/lib/affordability";
import { formatCurrency } from "@/shared/lib/format";
import { SEARCH_PROFILE_MAX_MONETARY_VALUE } from "@/shared/lib/constants";
import type { FilterOptions } from "@/types/data";

const options: FilterOptions = {
  towns: ["BEDOK"],
  flatTypes: ["4 ROOM", "5 ROOM"],
  flatModels: ["Model A"],
};

function renderWizard(onComplete = vi.fn(), onSkip = vi.fn()) {
  return render(
    <I18nProvider>
      <SearchProfileWizard options={options} onComplete={onComplete} onSkip={onSkip} />
    </I18nProvider>,
  );
}

async function clickPrimary(user: ReturnType<typeof userEvent.setup>, label: RegExp | string) {
  await user.click(screen.getByRole("button", { name: label }));
}

describe("SearchProfileWizard", () => {
  it("calls onSkip from the welcome step", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    renderWizard(vi.fn(), onSkip);

    await clickPrimary(user, /skip for now/i);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("blocks advancing on the flat-type step until a type is selected", async () => {
    const user = userEvent.setup();
    renderWizard();

    await clickPrimary(user, /get started/i);
    expect(screen.getByText(/what type of flat/i)).toBeInTheDocument();

    const nextButton = screen.getByRole("button", { name: /next/i });
    expect(nextButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    expect(nextButton).not.toBeDisabled();
  });

  it("blocks an out-of-range budget on the budget step", async () => {
    const user = userEvent.setup();
    renderWizard();

    await clickPrimary(user, /get started/i);
    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await clickPrimary(user, /next/i);

    const overMaxBudget = String(SEARCH_PROFILE_MAX_MONETARY_VALUE + 1);
    await user.type(screen.getByPlaceholderText(/e\.g\. 750000/i), overMaxBudget);
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
    });
    expect(expectedCeiling).toBeGreaterThan(0);

    await clickPrimary(user, /get started/i);
    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await clickPrimary(user, /next/i);
    await clickPrimary(user, /next/i);

    await user.type(screen.getByPlaceholderText(/raffles place mrt/i), "CBD Office");
    await user.click(screen.getByRole("button", { name: /select mrt station/i }));
    await user.click(screen.getByRole("option", { name: "Bedok" }));
    await user.click(screen.getByRole("button", { name: /30 min/i }));
    await clickPrimary(user, /next/i);

    await user.click(screen.getByRole("button", { name: /70 yr/i }));
    await clickPrimary(user, /next/i);

    await user.type(screen.getByLabelText(/^your age$/i), String(age));
    await user.type(screen.getByLabelText(/co-applicant age/i), "33");
    await user.type(screen.getByLabelText(/cpf oa balance/i), String(cpfOABalance));
    await user.type(screen.getByLabelText(/household monthly income/i), String(monthlyIncome));
    await clickPrimary(user, /next/i);

    expect(
      screen.getByText(`Max affordable: ${formatCurrency(expectedCeiling)}`),
    ).toBeInTheDocument();

    await clickPrimary(user, /continue to map/i);

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        mainFlatType: "4 ROOM",
        commuteAnchorLabel: "CBD Office",
        commuteAnchorMrt: "BEDOK MRT STATION",
        maxComfortableCommuteMinutes: 30,
        minimumRemainingLeaseYears: 70,
        age,
        coApplicantAge: 33,
        cpfOABalance,
        monthlyIncome,
      }),
    );
  });

  it("rejects applicant age below the minimum on the affordability step", async () => {
    const user = userEvent.setup();
    renderWizard();

    await clickPrimary(user, /get started/i);
    await user.click(screen.getByRole("button", { name: "4 ROOM" }));
    await clickPrimary(user, /next/i);
    await clickPrimary(user, /next/i);

    await user.type(screen.getByPlaceholderText(/raffles place mrt/i), "Office");
    await user.click(screen.getByRole("button", { name: /select mrt station/i }));
    await user.click(screen.getByRole("option", { name: "Bedok" }));
    await user.click(screen.getByRole("button", { name: /30 min/i }));
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
