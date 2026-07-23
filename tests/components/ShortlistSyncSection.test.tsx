import { describe, expect, it, vi } from "vite-plus/test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShortlistSyncSection } from "@/components/ShortlistSyncSection";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import { SyncCodeNotFoundError } from "@/features/shortlist/cloudSync";
import type { ShortlistSync } from "@/features/shortlist/useShortlistSync";

function makeSync(overrides: Partial<ShortlistSync> = {}): ShortlistSync {
  return {
    code: null,
    status: "local",
    enable: vi.fn().mockResolvedValue(undefined),
    link: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn(),
    ...overrides,
  };
}

function renderSection(sync: ShortlistSync) {
  return render(
    <I18nProvider>
      <ShortlistSyncSection sync={sync} />
    </I18nProvider>,
  );
}

describe("ShortlistSyncSection", () => {
  it("enabling sync calls sync.enable", async () => {
    const sync = makeSync();
    renderSection(sync);

    fireEvent.click(screen.getByTestId("sync-enable"));

    await waitFor(() => expect(sync.enable).toHaveBeenCalledTimes(1));
  });

  it("linking passes the entered code to sync.link", async () => {
    const sync = makeSync();
    renderSection(sync);

    fireEvent.change(screen.getByLabelText("Link an existing code"), {
      target: { value: "  MYCODE1234567890  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() => expect(sync.link).toHaveBeenCalledWith("MYCODE1234567890"));
  });

  it("shows the active sync code and status", () => {
    renderSection(makeSync({ code: "ABC123abc123ABC1", status: "synced" }));

    expect(screen.getByTestId("sync-code")).toHaveTextContent("ABC123abc123ABC1");
    expect(screen.getByTestId("sync-status")).toHaveTextContent("Synced");
  });

  it("a failed link shows a non-fatal error instead of crashing", async () => {
    const sync = makeSync({ link: vi.fn().mockRejectedValue(new SyncCodeNotFoundError()) });
    renderSection(sync);

    fireEvent.change(screen.getByLabelText("Link an existing code"), {
      target: { value: "UNKNOWNCODE12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    const alert = await screen.findByTestId("sync-error");
    expect(alert).toHaveTextContent("wasn't found");
    // The code input is still present — the component did not unmount/crash.
    expect(screen.getByLabelText("Link an existing code")).toBeInTheDocument();
  });
});
