import React from 'react';
import HomeView from './HomeView';
import HomeViewV2 from './HomeViewV2';
import { useUseNewHome } from '../homeUiFlagStore';

/**
 * Single switch point for Home UI refactors.
 * Keeps data/business logic in the caller unchanged.
 */
export default function HomeContainer(homeProps) {
  const useNewHome = useUseNewHome();
  console.log(`[HomeContainer] rendering ${useNewHome ? 'HomeViewV2' : 'HomeView'}`);
  if (useNewHome) {
    return <HomeViewV2 {...homeProps} />;
  }
  return <HomeView {...homeProps} />;
}

