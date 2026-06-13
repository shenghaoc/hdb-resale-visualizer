import { render, screen } from "@testing-library/react";
import { DocsNav } from "@/features/docs/DocsNav";
import type { DocsSection } from "@/features/docs/docsManifest";

const MOCK_SECTIONS: DocsSection[] = [
  { slug: "index", title: "Overview", content: "# Overview" },
  { slug: "getting-started", title: "Getting started", content: "# Getting started" },
  { slug: "filters-and-map", title: "Filters & map", content: "# Filters & map" },
  { slug: "faq", title: "FAQ", content: "# FAQ" },
];

describe("DocsNav", () => {
  it("renders all section links", () => {
    render(<DocsNav sections={MOCK_SECTIONS} activeSlug="index" navLabel="Guide sections" />);

    for (const section of MOCK_SECTIONS) {
      expect(screen.getByText(section.title)).toBeInTheDocument();
    }
  });

  it("marks the active section with aria-current='page'", () => {
    render(<DocsNav sections={MOCK_SECTIONS} activeSlug="faq" navLabel="Guide sections" />);

    const activeLink = screen.getByText("FAQ");
    expect(activeLink).toHaveAttribute("aria-current", "page");
  });

  it("does not mark inactive sections with aria-current", () => {
    render(<DocsNav sections={MOCK_SECTIONS} activeSlug="faq" navLabel="Guide sections" />);

    const inactiveLink = screen.getByText("Overview");
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });

  it("applies nav aria-label", () => {
    render(<DocsNav sections={MOCK_SECTIONS} activeSlug="index" navLabel="Guide sections" />);

    expect(screen.getByRole("navigation", { name: "Guide sections" })).toBeInTheDocument();
  });
});
