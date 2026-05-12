import React from 'react';
import HomeView from '../../components/HomeView';
import LongevityView from '../../LongevityView';

/**
 * Overlay fullscreen Healthspan / punteggio longevità e dettaglio rischi.
 */
export default function HealthspanOverlay({
  longevityData,
  longevityDays,
  setLongevityDays,
  onClose,
  onOpenAnalisiTab,
  longevityEngineScore,
  longevityExplanation,
  dailyKcalConsumed,
  dailyKcalTarget,
  userAge,
  bodyMetricsHistory,
  longevityScoreHistory,
  currentTrackerDate,
  fullHistory,
  userTargets,
  userProfile,
  onUpdateTDEE,
  tdeeHistory,
  predictiveCalibration,
  onBalanceCsvImport,
  onQuickWeighInSubmit,
  onDeleteBodyMetrics,
  pastDaysStorico,
  weeklyTrendData,
  weeklyMicrosTotals,
  weeklyKcalChartReference,
  longevityModalRiskRows,
  expandedRiskId,
  setExpandedRiskId,
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,12,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 100000, overflowY: 'auto', padding: '20px', backdropFilter: 'blur(10px)' }}>
      <div style={{ width: '100%', maxWidth: '500px', marginTop: '40px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
          <div>
            <h2 style={{ color: '#fff', margin: '0 0 5px 0', fontSize: '1.8rem' }}>Healthspan</h2>
            <select
              value={longevityDays}
              onChange={(e) => setLongevityDays(Number(e.target.value))}
              style={{ background: 'transparent', color: '#00e5ff', border: 'none', borderBottom: '1px dashed #00e5ff', padding: '2px 0', cursor: 'pointer', outline: 'none', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}
            >
              <option value={7} style={{ background: '#1a1a1c' }}>Ultimi 7 Giorni</option>
              <option value={30} style={{ background: '#1a1a1c' }}>Ultimo Mese</option>
              <option value={90} style={{ background: '#1a1a1c' }}>Ultimi 3 Mesi</option>
              <option value={365} style={{ background: '#1a1a1c' }}>Ultimo Anno</option>
            </select>
          </div>
          <button type="button" onClick={onClose} style={{ background: '#222', color: '#fff', border: 'none', borderRadius: '50%', width: '40px', height: '40px', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px', position: 'relative' }}>
          <div style={{ width: '180px', height: '180px', borderRadius: '50%', border: `4px solid ${longevityData.color}`, background: `${longevityData.color}10`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 40px ${longevityData.color}30` }}>
            <span style={{ color: longevityData.color, fontSize: '4rem', fontWeight: 'bold', lineHeight: '1' }}>{longevityData.masterScore}</span>
            <span style={{ color: '#aaa', fontSize: '0.85rem', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>Score statistiche</span>
          </div>
          <button
            type="button"
            onClick={onOpenAnalisiTab}
            aria-label="Apri timeline"
            title="Apri Timeline"
            style={{
              position: 'absolute',
              right: 'calc(50% - 108px)',
              bottom: -6,
              width: 34,
              height: 34,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(2,6,23,0.72)',
              color: '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.95rem',
              cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
              backdropFilter: 'blur(6px)',
            }}
          >
            🕒
          </button>
        </div>

        <HomeView
          longevity={longevityEngineScore}
          explanation={longevityExplanation}
          dailyKcalConsumed={dailyKcalConsumed}
          dailyKcalTarget={dailyKcalTarget}
        />

        <div style={{ marginBottom: '32px', color: '#e8e8e8' }}>
          <LongevityView
            data={longevityEngineScore}
            minimalOnly={false}
            showPriorityFocus={false}
            userAge={userAge}
            bodyMetricsHistory={bodyMetricsHistory}
            scoreHistory={longevityScoreHistory}
            periodAnchorDate={currentTrackerDate}
            fullHistory={fullHistory}
            userTargets={userTargets}
            userProfile={userProfile}
            onUpdateTDEE={onUpdateTDEE}
            tdeeHistory={tdeeHistory}
            predictionCalibration={predictiveCalibration}
            onBalanceCsvImport={onBalanceCsvImport}
            onQuickWeighInSubmit={onQuickWeighInSubmit}
            onDeleteBodyMetrics={onDeleteBodyMetrics}
            pastDaysStorico={pastDaysStorico}
            weeklyTrendData={weeklyTrendData}
            weeklyMicrosTotals={weeklyMicrosTotals}
            weeklyKcalChartReference={weeklyKcalChartReference}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
          {longevityModalRiskRows.map((risk) => {
            let rColor = '#00e5ff';
            if (risk.data.score > 40) rColor = '#f44336';
            else if (risk.data.score > 20) rColor = '#ffb300';

            const isExpanded = expandedRiskId === risk.id;

            return (
              <div
                key={risk.id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedRiskId(isExpanded ? null : risk.id);
                  }
                }}
                onClick={() => setExpandedRiskId(isExpanded ? null : risk.id)}
                style={{ background: '#1a1a1c', padding: '16px', borderRadius: '16px', border: `1px solid ${isExpanded ? rColor : '#2a2a2c'}`, cursor: 'pointer', transition: 'all 0.3s ease' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.5rem' }}>{risk.icon}</span>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1rem' }}>{risk.label}</div>
                      <div style={{ color: '#666', fontSize: '0.75rem' }}>{risk.desc}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: rColor, fontWeight: 'bold', fontSize: '1.2rem' }}>{risk.data.score}%</span>
                    <span style={{ color: '#555', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}>▼</span>
                  </div>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#111', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, risk.data.score)}%`, height: '100%', background: rColor, borderRadius: '3px', transition: 'width 1s ease-out' }} />
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #2a2a2c' }}>
                    <div style={{ fontSize: '0.75rem', color: '#00e5ff', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Insight Diagnostico</div>
                    <ul style={{ margin: 0, paddingLeft: '18px', color: '#ccc', fontSize: '0.85rem', lineHeight: '1.5' }}>
                      {risk.data.details.map((detail, idx) => (
                        <li key={idx} style={{ marginBottom: '6px' }}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
