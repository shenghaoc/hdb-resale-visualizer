import { useCallback, useEffect, useState } from "react";
import { fetchManifest } from "@/shared/lib/data";
import type { Manifest } from "@/types/data";

export function useManifestData() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestGeneration, setRequestGeneration] = useState(0);

  const retry = useCallback(() => {
    setManifest(null);
    setError(null);
    setRequestGeneration((current) => current + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;
    void fetchManifest()
      .then((nextManifest) => {
        if (!isMounted) return;
        setManifest(nextManifest);
        setError(null);
      })
      .catch((loadError) => {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load static data");
      });
    return () => {
      isMounted = false;
    };
  }, [requestGeneration]);

  return { manifest, error, retry };
}
