import React, { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CentroAnalisiView from '../features/centroAnalisi/CentroAnalisiView';

/**
 * Rotta isolata `/centro-analisi` (alias `/analisi`).
 * Query supportate (deep-link da Kentu Focus):
 * - ?area=strumentazione|calibrazione_target|progressione
 * - ?room=bussola|mappa|radar (solo con area=strumentazione)
 */
export default function CentroAnalisiPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const areaParam = String(params.get('area') || '').toLowerCase();

  const initialAreaId = useMemo(() => {
    if (areaParam === 'strumentazione' || areaParam === 'calibrazione_target') return areaParam;
    return null;
  }, [areaParam]);

  const initialRoomId = useMemo(() => {
    const room = String(params.get('room') || '').toLowerCase();
    if (['bussola', 'mappa', 'radar'].includes(room)) return room;
    return null;
  }, [params]);

  useEffect(() => {
    if (areaParam === 'progressione') {
      navigate('/', { replace: true, state: { openFotografia: 'progressione' } });
    }
  }, [areaParam, navigate]);

  if (areaParam === 'progressione') {
    return null;
  }

  return (
    <CentroAnalisiView
      initialAreaId={initialAreaId}
      initialRoomId={initialRoomId}
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
