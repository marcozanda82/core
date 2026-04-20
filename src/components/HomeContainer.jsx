import React from 'react';
import HomeView from './HomeView';
import HomeViewV2 from './HomeViewV2';

/**
 * Single switch point for Home UI refactors.
 * Keeps data/business logic in the caller unchanged.
 */
export default function HomeContainer({ useNewHome = false, ...homeProps }) {
  if (useNewHome) {
    return <HomeViewV2 {...homeProps} />;
  }
  return <HomeView {...homeProps} />;
}

