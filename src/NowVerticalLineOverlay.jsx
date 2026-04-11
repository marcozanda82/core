import React from 'react';
import { getNowVerticalLineBarStyle } from './timeLayout';

/** Linea verticale "ora attuale" sopra il grafico (stesso mapping orario della timeline). */
export default function NowVerticalLineOverlay({ hour, visible }) {
  if (!visible || hour == null || Number.isNaN(Number(hour))) return null;
  return <div aria-hidden style={getNowVerticalLineBarStyle(hour)} />;
}
