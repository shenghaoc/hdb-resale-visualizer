import { screen } from "@testing-library/react";
import { it } from "vite-plus/test";

/**
 * Surfaces that `src/App.tsx` mounts through `React.lazy()` behind a
 * `Suspense` boundary. Their `data-testid` only exists once the dynamic
 * import resolves, so a wait for one of these is a wait on module loading
 * rather than on application state.
 */
export type LazySurfaceTestId =
  | "map-view"
  | "results-pane"
  | "detail-drawer"
  | "shortlist-drawer"
  | "listing-check-panel";

/**
 * Testing Library's 1000ms default is a comfortable budget for a state
 * update but a tight one for resolving a lazy chunk: in the full parallel
 * suite these integration files contend for the event loop and the import
 * alone has been measured past a second. Give module loading a budget that
 * absorbs a loaded machine.
 */
const LAZY_SURFACE_WAIT_TIMEOUT_MS = 5000;

/**
 * Tests using `findLazySurface()` opt in to this larger test budget so the
 * Testing Library wait can finish first and preserve its useful
 * "unable to find element" diagnostic when a surface never mounts.
 */
const LAZY_SURFACE_TEST_TIMEOUT_MS = 10_000;

/**
 * Register a test that waits for a lazy surface with enough outer timeout
 * headroom for Testing Library to report a missing surface first.
 */
export function lazyIt(name: string, test: () => Promise<void>): void {
  it(name, { timeout: LAZY_SURFACE_TEST_TIMEOUT_MS }, test);
}

/**
 * Wait for a lazily-loaded app surface to finish mounting.
 *
 * Use this only for the first wait on a given surface — once it is on screen,
 * later assertions should use the synchronous `getBy*` queries so a genuine
 * regression still fails fast.
 */
export function findLazySurface(testId: LazySurfaceTestId): Promise<HTMLElement> {
  return screen.findByTestId(testId, {}, { timeout: LAZY_SURFACE_WAIT_TIMEOUT_MS });
}
