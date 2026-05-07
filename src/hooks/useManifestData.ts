import { useEffect, useState } from "react";
import { fetchManifest } from "@/lib/data";
import type { Manifest } from "@/types/data";

export function useManifestData() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    void fetchManifest()
      .then((nextManifest) => {
        if (isMounted) setManifest(nextManifest);
      })
      .catch((loadError) => {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load static data");
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return { manifest, error };
}
