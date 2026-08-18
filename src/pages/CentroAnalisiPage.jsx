import React from 'react';
import { useNavigate } from 'react-router-dom';
import CentroAnalisiView from '../features/centroAnalisi/CentroAnalisiView';

/**
 * Rotta isolata `/centro-analisi` (alias `/analisi`).
 * Non monta SalaComandi, Storico o motori esistenti.
 */
export default function CentroAnalisiPage() {
  const navigate = useNavigate();

  return (
    <CentroAnalisiView
      onExit={() => navigate('/', { replace: true })}
    />
  );
}
