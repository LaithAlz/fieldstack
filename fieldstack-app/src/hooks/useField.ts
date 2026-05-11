/**
 * Fetches a single field (with its parent venue nested) for the Field Detail
 * screen. Refetches whenever `fieldId` changes; a request-id guard drops
 * stale responses if the user navigates between fields quickly.
 */

import { useEffect, useRef, useState } from "react";

import { getField } from "../api/fields";
import type { Field, Venue } from "../types/api";

export type FieldWithVenue = Field & { venue: Venue };

type UseFieldResult = {
  data: FieldWithVenue | null;
  isLoading: boolean;
  error: Error | null;
};

export function useField(fieldId: string): UseFieldResult {
  const [data, setData] = useState<FieldWithVenue | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);

    (async () => {
      const result = await getField(fieldId);
      if (id !== requestId.current) return; // stale response — drop

      if (result.error) {
        setError(result.error);
        setData(null);
      } else {
        setData(result.data);
      }
      setIsLoading(false);
    })();
  }, [fieldId]);

  return { data, isLoading, error };
}
