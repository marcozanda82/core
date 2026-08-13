import React, { useEffect, useRef } from 'react';
import MicronutrientEnrichmentModal from '../../mealBuilder/components/MicronutrientEnrichmentModal.jsx';
import { findSemanticUsdaMatches } from '../../mealBuilder/utils/SemanticMatchmaker.js';

/**
 * Wrapper chat: carica match USDA per un alimento testuale e delega al bottom sheet condiviso.
 *
 * @param {{
 *   session: {
 *     foodName: string,
 *     masterDb?: object|null,
 *     isLoading?: boolean,
 *     matches?: object[],
 *     error?: string,
 *   } | null,
 *   onSelectMatch: (match: object) => void,
 *   onSkip: () => void,
 * }} props
 */
export default function ChatFoodEnrichmentModal({
  session = null,
  onSelectMatch,
  onSkip,
}) {
  const abortRef = useRef(null);
  const [localSession, setLocalSession] = React.useState(null);

  useEffect(() => {
    if (!session?.foodName) {
      setLocalSession(null);
      return undefined;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLocalSession({
      foodName: session.foodName,
      isLoading: true,
      matches: [],
      error: '',
    });

    void (async () => {
      try {
        const matches = await findSemanticUsdaMatches(session.foodName, session.masterDb, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setLocalSession({
          foodName: session.foodName,
          isLoading: false,
          matches: Array.isArray(matches) ? matches : [],
          error: '',
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('[ChatFoodEnrichmentModal] USDA search failed', error);
        setLocalSession({
          foodName: session.foodName,
          isLoading: false,
          matches: [],
          error: 'Match AI non disponibile. Puoi saltare e inserire i valori manualmente.',
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [session?.foodName, session?.masterDb]);

  const isOpen = Boolean(session?.foodName);
  const view = localSession || {
    foodName: session?.foodName || '',
    isLoading: true,
    matches: [],
    error: '',
  };

  return (
    <MicronutrientEnrichmentModal
      isOpen={isOpen}
      variant="chat"
      productName={view.foodName}
      isLoading={view.isLoading}
      error={view.error}
      matches={view.matches}
      onSelectMatch={onSelectMatch}
      onSkip={onSkip}
    />
  );
}
