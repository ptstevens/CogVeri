import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

// Types for transcription feature access
export interface TranscriptionFeatureAccess {
  hasBasicTranscription: boolean;
  hasAdvancedTranscription: boolean;
  hasAiSummaries: boolean;
  tier: string;
}

// Query Keys
export const transcriptionKeys = {
  all: ['transcription'] as const,
  featureAccess: () => [...transcriptionKeys.all, 'feature-access'] as const,
};

/**
 * Hook to check if the current organization has access to transcription features.
 * Used to conditionally render transcription UI or upgrade prompts.
 */
export function useTranscriptionAccess() {
  return useQuery<TranscriptionFeatureAccess>({
    queryKey: transcriptionKeys.featureAccess(),
    queryFn: async () => {
      const response = await api.get('/transcription/feature-access');
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - feature access doesn't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

export default useTranscriptionAccess;
