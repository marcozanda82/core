import React from 'react';
import { useNavigate } from 'react-router-dom';
import CentroAnalisiView from '../features/centroAnalisi/CentroAnalisiView';

/**
 * Rotta isolata `/centro-analisi` (alias `/analisi`).
 * Salute / Progressione reindirizzano a Home → stessa Fotografia dei widget.
 */
export default function CentroAnalisiPage() {
  const navigate = useNavigate();

  return (
    <CentroAnalisiView
      onExit={() => navigate('/', { replace: true })}
      onOpenFotografiaSalute={() => {
        navigate('/', { replace: true, state: { openFotografia: 'salute' } });
      }}
      onOpenFotografiaProgressione={() => {
        navigate('/', { replace: true, state: { openFotografia: 'progressione' } });
      }}
    />
  );
}
