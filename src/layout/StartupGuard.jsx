import React from 'react';
import { UserNutritionGoalsProvider } from '../UserNutritionGoalsContext';
import FirebaseDataLoadingLayer from '../components/FirebaseDataLoadingLayer';

/** Provider obiettivi nutrizione + overlay copertura startup (auth / primo caricamento dati). */
export default function StartupGuard({ nutritionGoalsValue, startupOverlayBlocking, children }) {
  return (
    <UserNutritionGoalsProvider value={nutritionGoalsValue}>
      <>
        <FirebaseDataLoadingLayer blocking={startupOverlayBlocking} />
        {children}
      </>
    </UserNutritionGoalsProvider>
  );
}
