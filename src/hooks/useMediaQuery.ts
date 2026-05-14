import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const getMatches = (query: string): boolean => {
    // Prevents SSR issues
    if (typeof window !== "undefined") {
      return window.matchMedia(query).matches;
    }
    return false;
  };

  const [matches, setMatches] = useState<boolean>(() => getMatches(query));

  useEffect(() => {
    const matchMedia = window.matchMedia(query);

    function handleChange() {
      setMatches(matchMedia.matches);
    }

    // Sync once in case the query changed.
    handleChange();

    // Prefer the standard EventTarget API; fall back to the deprecated
    // addListener form only when addEventListener is not available
    // (older Safari prior to 14).
    if (typeof matchMedia.addEventListener === "function") {
      matchMedia.addEventListener("change", handleChange);
      return () => matchMedia.removeEventListener("change", handleChange);
    }
    matchMedia.addListener(handleChange);
    return () => matchMedia.removeListener(handleChange);
  }, [query]);

  return matches;
}
