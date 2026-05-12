import React from 'react';
import { TARGETS } from '../useBiochimico';
import NutrientProgressBar from './NutrientProgressBar';

/** Allineato a MealBuilder / PastoDrawer: ordine slide carousel telemetria. */
export const TELEMETRY_TABS = ['macro', 'bilanci', 'amino', 'vit', 'min', 'fat'];

function TelemetryRatioBar({ title, labelA, valA, labelB, valB, idealText, isGood }) {
  const vA = Number(valA) || 0;
  const vB = Number(valB) || 0;
  const total = vA + vB;
  const percentA = total > 0 ? (vA / total) * 100 : 50;
  return (
    <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#aaa', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
        <span>{title}</span>
        <span style={{ color: isGood ? '#00e676' : '#ffea00' }}>{idealText}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px', fontWeight: 'bold' }}>
        <span style={{ color: '#ff6d00' }}>{labelA}: {Math.round(vA)}</span>
        <span style={{ color: '#00e5ff' }}>{labelB}: {Math.round(vB)}</span>
      </div>
      <div style={{ height: '8px', background: '#00e5ff', borderRadius: '4px', overflow: 'hidden', display: 'flex', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
        <div style={{ width: `${percentA}%`, background: '#ff6d00', transition: 'width 0.5s', borderRight: '2px solid #111' }} />
      </div>
    </div>
  );
}

/**
 * Pannello Diario → Telemetria: tab, carousel e barre nutrienti.
 * Dati e target arrivano dal genitore (SalaComandi).
 */
export default function TelemetryPanel({
  telemetrySubTab,
  setTelemetrySubTab,
  telemetryScrollRef,
  totali,
  dynamicDailyKcal,
  userTargets,
  drilldownKey,
  onToggleNutrientDrilldown,
  drilldownFoodEntriesForToday,
}) {
  const barProps = {
    drilldownKey,
    onToggleNutrientDrilldown,
    drilldownFoodEntriesForToday,
  };

  return (
    <div className="view-animate">
      <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px', flexShrink: 0 }}>
        {TELEMETRY_TABS.map((t, idx) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTelemetrySubTab(t);
              if (telemetryScrollRef.current) {
                telemetryScrollRef.current.scrollTo({ left: telemetryScrollRef.current.clientWidth * idx, behavior: 'smooth' });
              }
            }}
            style={{ padding: '8px 15px', fontSize: '0.7rem', background: telemetrySubTab === t ? '#00e676' : '#111', color: telemetrySubTab === t ? '#000' : '#888', border: 'none', borderRadius: '20px', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer' }}
          >
            {t}
          </button>
        ))}
      </div>
      <div
        ref={telemetryScrollRef}
        className="telemetry-carousel"
        onScroll={() => {
          const el = telemetryScrollRef.current;
          if (!el) return;
          const idx = Math.round(el.scrollLeft / el.clientWidth);
          const tab = TELEMETRY_TABS[idx];
          if (tab && tab !== telemetrySubTab) setTelemetrySubTab(tab);
        }}
        style={{ width: '100%', flex: 1, minHeight: 0 }}
      >
        <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
          <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
            <NutrientProgressBar label="Calorie" current={totali.kcal || 0} target={dynamicDailyKcal} unit="kcal" nutrientKey="kcal" {...barProps} />
            <NutrientProgressBar label="PROTEINE" current={totali.prot} target={userTargets.prot ?? TARGETS.macro.prot} unit="g" nutrientKey="prot" {...barProps} />
            <NutrientProgressBar label="CARBOIDRATI" current={totali.carb} target={userTargets.carb ?? TARGETS.macro.carb} unit="g" nutrientKey="carb" {...barProps} />
            <NutrientProgressBar label="GRASSI TOTALI" current={totali.fatTotal} target={userTargets.fatTotal ?? TARGETS.macro.fatTotal} unit="g" nutrientKey="fatTotal" {...barProps} />
          </div>
        </div>
        <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
          <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
            <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '15px' }}>RAPPORTI BIOCHIMICI</h4>
            <TelemetryRatioBar title="Equilibrio Elettrolitico (Idratazione)" labelA="Sodio (Na)" valA={totali?.na} labelB="Potassio (K)" valB={totali?.k} idealText={'Ideale: Na < K'} isGood={(Number(totali?.na) || 0) < (Number(totali?.k) || 0)} />
            <TelemetryRatioBar title="Indice Infiammatorio (Grassi)" labelA="Omega 6" valA={totali?.omega6} labelB="Omega 3" valB={totali?.omega3} idealText={'Ideale: W6:W3 < 4:1'} isGood={(Number(totali?.omega6) || 0) <= (Number(totali?.omega3) || 1) * 4} />
          </div>
        </div>
        <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
          <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
            {Object.keys(TARGETS.amino).map((k) => (
              <NutrientProgressBar key={k} label={k.toUpperCase()} current={totali[k] || 0} target={TARGETS.amino[k]} unit="mg" nutrientKey={k} {...barProps} />
            ))}
          </div>
        </div>
        <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
          <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
            {Object.keys(TARGETS.vit).map((k) => (
              <NutrientProgressBar key={k} label={k.toUpperCase()} current={totali[k] || 0} target={TARGETS.vit[k]} unit={k === 'vitA' || k === 'b9' ? 'µg' : 'mg'} nutrientKey={k} {...barProps} />
            ))}
          </div>
        </div>
        <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
          <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
            {Object.keys(TARGETS.min).map((k) => (
              <NutrientProgressBar key={k} label={k.toUpperCase()} current={totali[k] || 0} target={TARGETS.min[k]} unit={k === 'se' ? 'µg' : 'mg'} nutrientKey={k} {...barProps} />
            ))}
          </div>
        </div>
        <div className="telemetry-carousel-slide" style={{ padding: '0 2px' }}>
          <div style={{ background: '#111', padding: '20px', borderRadius: '15px' }}>
            <NutrientProgressBar label="Grassi Totali" current={totali.fatTotal || totali.fat || 0} target={userTargets.fatTotal ?? userTargets.fat ?? 70} unit="g" nutrientKey="fatTotal" {...barProps} />
            {Object.keys(TARGETS.fat).map((k) => (
              <NutrientProgressBar key={k} label={k.toUpperCase()} current={totali[k] || 0} target={TARGETS.fat[k]} unit="g" nutrientKey={k} {...barProps} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
