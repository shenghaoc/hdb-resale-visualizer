import { useSyncExternalStore } from "react";

/**
 * Minimal path-aware routing for the in-app user guide. The app keeps all of
 * its own state in the query string, so docs navigation only touches the
 * pathname and always preserves `location.search` — leaving the guide returns
 * the user to exactly the filters/selection they had.
 */

export const DOCS_PATH_PREFIX = "/docs";
export const DOCS_INDEX_SLUG = "index";

const listeners = new Set<() => void>();

function handlePopState() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("popstate", handlePopState);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("popstate", handlePopState);
    }
  };
}

function getPathname(): string {
  return window.location.pathname;
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPathname, () => "/");
}

export function navigate(pathname: string, options?: { replace?: boolean }): void {
  const url = `${pathname}${window.location.search}`;
  if (options?.replace) {
    window.history.replaceState({}, "", url);
  } else {
    window.history.pushState({}, "", url);
  }
  for (const listener of listeners) {
    listener();
  }
}

export function isDocsPath(pathname: string): boolean {
  return pathname === DOCS_PATH_PREFIX || pathname.startsWith(`${DOCS_PATH_PREFIX}/`);
}

/** Builds the in-app path for a docs section slug. */
export function docsPath(slug: string): string {
  return slug === DOCS_INDEX_SLUG ? DOCS_PATH_PREFIX : `${DOCS_PATH_PREFIX}/${slug}`;
}

/** Extracts the section slug from a /docs pathname; unknown shapes fall back to the index. */
export function slugFromPath(pathname: string): string {
  if (!isDocsPath(pathname)) return DOCS_INDEX_SLUG;
  const rest = pathname.slice(DOCS_PATH_PREFIX.length).replace(/^\/+|\/+$/g, "");
  return rest === "" ? DOCS_INDEX_SLUG : rest;
}
