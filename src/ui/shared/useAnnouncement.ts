import { useCallback, useState } from "react";

/**
 * A message for a polite status region, and what sets it. The same
 * message twice in a row gets a no-break space added, so the region's
 * text changes and a screen reader says it again.
 */
export function useAnnouncement(): [string, (message: string) => void] {
  const [announcement, setAnnouncement] = useState("");
  const announce = useCallback((message: string) => {
    setAnnouncement((shown) =>
      shown === message ? `${message}\u00a0` : message,
    );
  }, []);
  return [announcement, announce];
}
