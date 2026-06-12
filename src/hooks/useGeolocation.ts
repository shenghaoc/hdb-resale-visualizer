import { useCallback, useMemo, useRef, useState } from "react";
import type { Coordinates } from "@/types/data";
import type { Translator } from "@/shared/lib/i18n";

export function useGeolocation({ t }: { t: Translator }) {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const clearError = useCallback(() => setGeolocationError(null), []);
  const isLocatingRef = useRef(false);

  // Invalidates any in-flight getCurrentPosition call so a stale response
  // cannot overwrite user state after they've navigated elsewhere.
  const cancelPendingRequest = useCallback(() => {
    requestIdRef.current += 1;
    isLocatingRef.current = false;
    setIsLocating(false);
  }, []);

  const locate = useCallback(
    (onSuccess: (coords: Coordinates) => void, onCannotLocate?: () => void) => {
      if (isLocatingRef.current) return;

      if (!navigator.geolocation) {
        setGeolocationError(t("app.locationUnavailable"));
        onCannotLocate?.();
        return;
      }

      setGeolocationError(null);
      isLocatingRef.current = true;
      setIsLocating(true);
      const requestId = ++requestIdRef.current;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (requestIdRef.current !== requestId) return;
          const coords: Coordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          isLocatingRef.current = false;
          setIsLocating(false);
          setUserLocation(coords);
          setGeolocationError(null);
          onSuccess(coords);
        },
        () => {
          if (requestIdRef.current !== requestId) return;
          isLocatingRef.current = false;
          setIsLocating(false);
          setGeolocationError(t("app.locationFailed"));
          onCannotLocate?.();
        },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
      );
    },
    [t],
  );

  return useMemo(
    () => ({
      userLocation,
      setUserLocation,
      isLocating,
      geolocationError,
      clearError,
      cancelPendingRequest,
      locate,
    }),
    [userLocation, isLocating, geolocationError, clearError, cancelPendingRequest, locate],
  );
}
