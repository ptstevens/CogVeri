/**
 * Hook for lazy-loading recording durations
 *
 * For recordings with 0 or null duration, this hook will call the backend
 * to probe the actual video file and update the duration in the database.
 *
 * This is a "lazy backfill" pattern - durations get updated on-demand when viewed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

interface Recording {
  id: string;
  duration_seconds: number | null | undefined;
  status?: string;
}

interface DurationMap {
  [recordingId: string]: number | null;
}

/**
 * Fetches and caches actual durations for recordings that have 0/null duration.
 *
 * @param recordings - Array of recordings to check
 * @returns Object mapping recording IDs to their actual durations
 */
export function useRecordingDurations(recordings: Recording[]): DurationMap {
  const [durations, setDurations] = useState<DurationMap>({});
  const pendingRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  const fetchDuration = useCallback(async (recordingId: string) => {
    // Skip if already fetching or already have a result
    if (pendingRef.current.has(recordingId) || durations[recordingId] !== undefined) {
      return;
    }

    pendingRef.current.add(recordingId);

    try {
      const response = await api.post(`/recordings/${recordingId}/refresh-duration`);
      const duration = response.data?.data?.duration_seconds;

      if (mountedRef.current) {
        setDurations(prev => ({
          ...prev,
          [recordingId]: duration ?? null,
        }));
      }
    } catch (error) {
      // On error, set to null so we don't retry repeatedly
      if (mountedRef.current) {
        setDurations(prev => ({
          ...prev,
          [recordingId]: null,
        }));
      }
    } finally {
      pendingRef.current.delete(recordingId);
    }
  }, [durations]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Find recordings that need duration refresh
    const needsRefresh = recordings.filter(rec => {
      // Only refresh completed recordings with 0/null duration
      const hasMissingDuration = !rec.duration_seconds || rec.duration_seconds <= 0;
      const isCompleted = rec.status === 'completed';
      const notAlreadyFetched = durations[rec.id] === undefined;
      const notPending = !pendingRef.current.has(rec.id);

      return hasMissingDuration && isCompleted && notAlreadyFetched && notPending;
    });

    // Fetch durations for recordings that need it
    needsRefresh.forEach(rec => {
      fetchDuration(rec.id);
    });
  }, [recordings, fetchDuration, durations]);

  return durations;
}

/**
 * Helper to get the display duration for a recording.
 * Returns the actual duration if available, or the original duration_seconds.
 */
export function getDisplayDuration(
  recording: Recording,
  durations: DurationMap
): number | null {
  // If we have a fetched duration, use it
  if (durations[recording.id] !== undefined && durations[recording.id] !== null) {
    return durations[recording.id];
  }

  // Otherwise fall back to the recording's stored duration
  return recording.duration_seconds ?? null;
}
