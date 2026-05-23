import React from 'react';
import { FastChargeNapQuickPanel } from '../../components/modals/FastChargeQuickActionPanels';

/**
 * Drawer viste: idratazione e Fast Charge (pisolino, meditazione, integrazione).
 * `mode` seleziona il layout; tutta la logica resta nei callback passati dal parent.
 */
export default function QuickActionsView({
  mode,
  onBack,
  decimalToTimeStr,
  parseTimeStrToDecimal,
  getTimePositionPercent,
  // water
  drawerWaterTime,
  setDrawerWaterTime,
  miniTimelineWaterRef,
  handleMiniTimelineDrag,
  allNodes,
  waterProgress,
  waterIntake,
  dailyWaterGoal,
  handleAddWater,
  isSimulationMode,
  manualNodes,
  setManualNodes,
  syncDatiFirebase,
  dailyLog,
  // fast charge shared
  drawerFastChargeStart,
  setDrawerFastChargeStart,
  drawerFastChargeEnd,
  setDrawerFastChargeEnd,
  drawerFastChargeTime,
  setDrawerFastChargeTime,
  fastChargeSupplementName,
  setFastChargeSupplementName,
  handleSaveFastCharge,
}) {
  if (mode === 'water') {
    return (
      <div className="view-animate">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
          <h2 style={{ fontSize: '0.8rem', color: '#00e5ff', letterSpacing: '2px', margin: 0 }}>💧 IDRATAZIONE</h2>
          <div style={{ width: '70px' }} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#888', fontSize: '0.7rem', marginBottom: '8px' }}>
            <span>0:00</span>
            <input type="time" value={decimalToTimeStr(drawerWaterTime)} onChange={(e) => setDrawerWaterTime(parseTimeStrToDecimal(e.target.value))} style={{ width: '130px', minWidth: '110px', padding: '8px 10px', background: '#1a1a1a', border: '1px solid #00e5ff', borderRadius: '8px', color: '#00e5ff', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center', letterSpacing: '1px' }} />
            <span>24:00</span>
          </div>
          <div ref={miniTimelineWaterRef} style={{ position: 'relative', height: '36px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid #333', touchAction: 'pan-x' }}>
            {allNodes.map((n) => {
              const isWork = n.type === 'work';
              const startP = getTimePositionPercent(n.time);
              const durP = isWork ? getTimePositionPercent(n.duration || 1) : 0;
              if (isWork) {
                return (
                  <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(255, 234, 0, 0.2)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
                );
              }
              return (
                <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid #666', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
              );
            })}
            <div className="mini-timeline-hitbox" role="slider" aria-label="Ora acqua" onPointerDown={(e) => handleMiniTimelineDrag(e, miniTimelineWaterRef, 'point', drawerWaterTime, null, setDrawerWaterTime, null)} style={{ position: 'absolute', left: `${getTimePositionPercent(drawerWaterTime)}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '44px', height: '44px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, touchAction: 'none' }}>
              <div className="mini-timeline-point-bubble" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '28px', height: '28px', borderRadius: '50%', background: '#00e5ff', border: '2px solid #fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(0,229,255,0.5)', pointerEvents: 'none' }}>
                <span style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#000' }}>{decimalToTimeStr(drawerWaterTime)}</span>
                <span style={{ lineHeight: 1 }}>💧</span>
              </div>
            </div>
          </div>
        </div>
        <div className="water-glass" style={{ padding: '28px 20px', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <div className="water-sphere">
              <div className="water-sphere-inner">
                <div className="water-wave" style={{ height: `${waterProgress}%` }} />
              </div>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
                <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.95)', textShadow: '0 0 20px rgba(0,229,255,0.5)' }}>{Math.round(waterProgress)}%</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>{waterIntake} <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.5)', fontWeight: 'normal' }}>ml</span></div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(0, 229, 255, 0.9)', letterSpacing: '1px' }}>obiettivo {dailyWaterGoal} ml</div>
            </div>
          </div>
        </div>
        <div className="water-glass" style={{ padding: '16px', display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <button type="button" onClick={() => handleAddWater(250)} className="water-quick-btn" style={{ flex: 1 }}><span style={{ fontSize: '1.8rem', marginBottom: '4px' }}>🥛</span><span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>+ 250</span></button>
          <button type="button" onClick={() => handleAddWater(500)} className="water-quick-btn" style={{ flex: 1 }}><span style={{ fontSize: '1.8rem', marginBottom: '4px' }}>🚰</span><span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>+ 500</span></button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => handleAddWater(-250)} className="water-rectify-btn">− 250</button>
          <button type="button" onClick={() => handleAddWater(-500)} className="water-rectify-btn">− 500</button>
          <button type="button" onClick={() => { if (isSimulationMode) return; const next = manualNodes.filter((n) => n.type !== 'water'); setManualNodes(next); syncDatiFirebase(dailyLog, next); }} className="water-rectify-btn" style={{ borderColor: 'rgba(255, 77, 77, 0.4)', color: '#ff4d4d' }}>Azzera</button>
        </div>
      </div>
    );
  }

  if (mode === 'fast_charge_nap') {
    return (
      <FastChargeNapQuickPanel
        onBack={onBack}
        drawerFastChargeStart={drawerFastChargeStart}
        setDrawerFastChargeStart={setDrawerFastChargeStart}
        drawerFastChargeEnd={drawerFastChargeEnd}
        setDrawerFastChargeEnd={setDrawerFastChargeEnd}
        decimalToTimeStr={decimalToTimeStr}
        parseTimeStrToDecimal={parseTimeStrToDecimal}
        onSaveNap={() => handleSaveFastCharge('nap')}
      />
    );
  }

  if (mode === 'fast_charge_meditation') {
    return (
      <div className="view-animate">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
          <h2 style={{ fontSize: '0.8rem', color: '#22c55e', letterSpacing: '2px', margin: 0 }}>🧘 MEDITAZIONE</h2>
          <div style={{ width: '70px' }} />
        </div>
        <div style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '16px', backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '2px', marginBottom: '12px', textTransform: 'uppercase' }}>ORA INIZIO – ORA FINE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <input type="time" value={decimalToTimeStr(drawerFastChargeStart)} onChange={(e) => setDrawerFastChargeStart(parseTimeStrToDecimal(e.target.value))} style={{ flex: 1, minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #22c55e', borderRadius: '10px', color: '#4ade80', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }} />
            <span style={{ color: '#666' }}>–</span>
            <input type="time" value={decimalToTimeStr(drawerFastChargeEnd)} onChange={(e) => setDrawerFastChargeEnd(parseTimeStrToDecimal(e.target.value))} style={{ flex: 1, minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #22c55e', borderRadius: '10px', color: '#4ade80', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '10px' }}>Durata: {(() => { let d = drawerFastChargeEnd - drawerFastChargeStart; if (d < 0) d += 24; return `${Math.floor(Math.max(0, d) * 60)} min`; })()}</div>
        </div>
        <button type="button" onClick={() => handleSaveFastCharge('meditation')} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#fff', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: '0 0 20px rgba(34,197,94,0.4)' }}>SALVA</button>
      </div>
    );
  }

  if (mode === 'fast_charge_supplements') {
    return (
      <div className="view-animate">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
          <h2 style={{ fontSize: '0.8rem', color: '#a855f7', letterSpacing: '2px', margin: 0 }}>💊 INTEGRAZIONE</h2>
          <div style={{ width: '70px' }} />
        </div>
        <div style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '12px', backdropFilter: 'blur(12px)' }}>
          <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '2px', marginBottom: '12px', textTransform: 'uppercase' }}>ORARIO</div>
          <input type="time" value={decimalToTimeStr(drawerFastChargeTime)} onChange={(e) => setDrawerFastChargeTime(parseTimeStrToDecimal(e.target.value))} style={{ width: '100%', padding: '10px', background: '#1a1a1a', border: '1px solid #a855f7', borderRadius: '10px', color: '#c084fc', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '12px' }} />
          <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '2px', marginBottom: '8px', textTransform: 'uppercase' }}>Nome supplemento (opzionale)</div>
          <input type="text" value={fastChargeSupplementName} onChange={(e) => setFastChargeSupplementName(e.target.value)} placeholder="Es. Magnesio, Vitamina D..." style={{ width: '100%', padding: '10px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '10px', color: '#fff', fontSize: '0.9rem' }} />
        </div>
        <button type="button" onClick={() => handleSaveFastCharge('supplements')} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: '0 0 20px rgba(168,85,247,0.4)' }}>SALVA</button>
      </div>
    );
  }

  return null;
}
