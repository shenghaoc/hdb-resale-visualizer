import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ButtonGroup } from "@/components/ui/button-group";

describe("ButtonGroup", () => {
  afterEach(cleanup);

  // CVA defaultVariants only resolves the class string, not the React prop, so
  // data-orientation must be defaulted explicitly or it is omitted from the DOM
  // for the (default) horizontal case, breaking attribute-based assertions.
  it("sets data-orientation='horizontal' by default", () => {
    render(<ButtonGroup data-testid="bg" />);
    expect(screen.getByTestId("bg")).toHaveAttribute("data-orientation", "horizontal");
  });

  it("reflects an explicit vertical orientation", () => {
    render(<ButtonGroup data-testid="bg" orientation="vertical" />);
    expect(screen.getByTestId("bg")).toHaveAttribute("data-orientation", "vertical");
  });
});
