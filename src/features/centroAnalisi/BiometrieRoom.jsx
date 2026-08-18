import React, { useCallback, useMemo } from 'react';
import BiometricsHealthCard from '../trendHub/components/BiometricsHealthCard';
import SaluteWeightTrendChart from '../trendHub/components/SaluteWeightTrendChart';
import { buildBiometricsHealthSnapshot } from '../trendHub/utils/healthBiometrics';
import {
  computeWaistToHeightRatio,
  REFERENCE_HEIGHT_CM,
  WHTR_LIMIT_RATIO,
} from '../trendHub/utils/saluteDashboardMetrics';
import { GLASS_SURFACE_CLASS } from './glassStyles';

function GlassSpinner({ label = 'Sincronizzo le biometrie…' }) {
  return (
    <section
      className={`flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-busy
      aria-live="polite"
    >
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300"
        aria-hidden
      />
      <p className="text-sm text-zinc-400">{label}</p>
    </section>
  );
}

function GlassNotice({ title, body }) {
  return (
    <section
      className={`flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-live="polite"
    >
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-400">{body}</p>
    </section>
  );
}

function WhtrGlassPanel({ waistToHeightRatio, waistCm, heightCm }) {
  const whtr = waistToHeightRatio;
  const status = whtr == null
    ? { label: 'Dati insufficienti', tone: 'text-zinc-400' }
    : whtr < 0.46
      ? { label: 'Ottimale', tone: 'text-emerald-400' }
      : whtr < WHTR_LIMIT_RATIO
        ? { label: 'Nella norma', tone: 'text-cyan-300' }
        : whtr < 0.55
          ? { label: 'Attenzione', tone: 'text-amber-300' }
          : { label: 'Elevato', tone: 'text-rose-400' };

  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl px-4 py-4 ${GLASS_SURFACE_CLASS}`}
      aria-label="Rapporto girovita-altezza"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            WHtR · Girovita / Altezza
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Soglia clinica &lt; {WHTR_LIMIT_RATIO} · altezza {heightCm} cm
          </p>
        </div>
        <span className={`text-sm font-semibold ${status.tone}`}>{status.label}</span>
      </div>
      <div className="flex items-end justify-between gap-4">
        <p className="text-3xl font-semibold tabular-nums text-zinc-50">
          {whtr != null ? whtr.toFixed(3) : '—'}
        </p>
        <p className="text-right text-xs leading-relaxed text-zinc-500">
          Girovita attuale:{' '}
          <span className="font-semibold text-zinc-300">
            {waistCm != null ? `${waistCm} cm` : 'n/d'}
          </span>
        </p>
      </div>
    </section>
  );
}

/**
 * Stanza Biometrie — card metriche e trend peso in sola lettura.
 * Non modifica SnapshotHub / SaluteView / trendHub / Sala Comandi.
 */
export default function BiometrieRoom({ store }) {
  const {
    ready,
    isAuthenticated,
    todayDate,
    bodyMetricsHistory,
    userProfile,
  } = store || {};

  const metricsHistory = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];

  const heightCm = useMemo(() => {
    const fromProfile = Number(userProfile?.height ?? userProfile?.heightCm);
    return fromProfile > 0 ? fromProfile : REFERENCE_HEIGHT_CM;
  }, [userProfile]);

  const biometricsSnapshot = useMemo(
    () => buildBiometricsHealthSnapshot(metricsHistory),
    [metricsHistory],
  );

  const waistToHeightRatio = useMemo(
    () => computeWaistToHeightRatio(biometricsSnapshot.waistCm, heightCm),
    [biometricsSnapshot.waistCm, heightCm],
  );

  const handleSaveBiometricsReadOnly = useCallback(async () => {
    console.info('[centroAnalisi/biometrie] Salvataggio disabilitato — modulo in sola lettura.');
    return false;
  }, []);

  if (!ready) {
    return <GlassSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <GlassNotice
        title="Dati non disponibili"
        body="Accedi da KentuOS per leggere peso, girovita e trend in sola lettura."
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <BiometricsHealthCard
        bodyMetricsHistory={metricsHistory}
        onSaveBiometrics={handleSaveBiometricsReadOnly}
        todayDate={todayDate}
      />
      <WhtrGlassPanel
        waistToHeightRatio={waistToHeightRatio}
        waistCm={biometricsSnapshot.waistCm}
        heightCm={heightCm}
      />
      <section
        className={`flex flex-col gap-2 rounded-2xl px-3 py-4 ${GLASS_SURFACE_CLASS}`}
        aria-label="Trend peso recente"
      >
        <p className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Trend peso · ultime misure
        </p>
        <SaluteWeightTrendChart recentBodyMetrics={metricsHistory} />
      </section>
    </div>
  );
}
