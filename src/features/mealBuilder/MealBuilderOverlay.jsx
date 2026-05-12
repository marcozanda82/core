import React from 'react';
import PastoDrawer from '../../components/drawers/PastoDrawer';

/**
 * Overlay costruttore pasto (add food, porzioni, ricerca, barcode, salvataggio).
 * Estratto da SalaComandi: inoltra tutte le props a PastoDrawer senza alterare il comportamento.
 */
export default function MealBuilderOverlay(props) {
  return <PastoDrawer {...props} />;
}
