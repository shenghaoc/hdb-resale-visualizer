import { screen } from "@testing-library/react";

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
 * absorbs a loaded machine, while staying far below the Vitest per-test
 * timeout so a surface that never mounts still fails with the useful
 * "unable to find element" message rather than a bare test timeout.
 */
export const LAZY_SURFACE_TIMEOUT_MS = 5000;

/**
 * Wait for a lazily-loaded app surface to finish mounting.
 *
 * Use this only for the first wait on a given surface — once it is on screen,
 * later assertions should use the synchronous `getBy*` queries so a genuine
 * regression still fails fast.
 */
export function findLazySurface(testId: LazySurfaceTestId): Promise<HTMLElement> {
  return screen.findByTestId(testId, {}, { timeout: LAZY_SURFACE_TIMEOUT_MS });
}
