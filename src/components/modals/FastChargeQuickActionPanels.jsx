import React, { useRef } from 'react';
import FastChargeNapDurationMinutesField from '../inputs/FastChargeNapDurationMinutesField';

export function FastChargeNapQuickPanel({
  onBack,
  drawerFastChargeStart,
  setDrawerFastChargeStart,
  drawerFastChargeEnd,
  setDrawerFastChargeEnd,
  decimalToTimeStr,
  parseTimeStrToDecimal,
  onSaveNap,
}) {
  const durationFieldRef = useRef(null);

  const handleSave = () => {
    durationFieldRef.current?.commit?.();
    onSaveNap();
  };

  return (
    <div className="view-animate">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
        <h2 style={{ fontSize: '0.8rem', color: '#818cf8', letterSpacing: '2px', margin: 0 }}>😴 PISOLINO</h2>
        <div style={{ width: '70px' }} />
      </div>
      <div style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid #2a2a2a', marginBottom: '16px', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>
              Durata (Minuti)
            </div>
            <FastChargeNapDurationMinutesField
              ref={durationFieldRef}
              drawerFastChargeStart={drawerFastChargeStart}
              setDrawerFastChargeStart={setDrawerFastChargeStart}
              drawerFastChargeEnd={drawerFastChargeEnd}
              style={{ width: '100%', minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #818cf8', borderRadius: '10px', color: '#a5b4fc', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>
              Ora del risveglio
            </div>
            <input
              type="time"
              value={decimalToTimeStr(drawerFastChargeEnd)}
              onChange={(e) => {
                const nextEnd = parseTimeStrToDecimal(e.target.value);
                let durationHours = Number(drawerFastChargeEnd) - Number(drawerFastChargeStart);
                if (durationHours < 0) durationHours += 24;
                durationHours = Math.max(0, durationHours);
                let nextStart = nextEnd - durationHours;
                while (nextStart < 0) nextStart += 24;
                while (nextStart >= 24) nextStart -= 24;
                setDrawerFastChargeEnd(nextEnd);
                setDrawerFastChargeStart(nextStart);
              }}
              style={{ width: '100%', minWidth: '100px', padding: '10px', background: '#1a1a1a', border: '1px solid #818cf8', borderRadius: '10px', color: '#a5b4fc', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center' }}
            />
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '10px' }}>Durata: {(() => { let d = drawerFastChargeEnd - drawerFastChargeStart; if (d < 0) d += 24; d = Math.max(0, d); return `${Math.floor(d * 60)} min`; })()}</div>
      </div>
      <button type="button" onClick={handleSave} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: '0 0 20px rgba(129,140,248,0.4)' }}>SALVA</button>
    </div>
  );
}

export function FastChargeMeditationQuickPanel({
  onBack,
  drawerFastChargeStart,
  setDrawerFastChargeStart,
  drawerFastChargeEnd,
  setDrawerFastChargeEnd,
  decimalToTimeStr,
  parseTimeStrToDecimal,
  onSaveMeditation,
}) {
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
      <button type="button" onClick={onSaveMeditation} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#fff', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: '0 0 20px rgba(34,197,94,0.4)' }}>SALVA</button>
    </div>
  );
}

export function FastChargeSupplementsQuickPanel({
  onBack,
  drawerFastChargeTime,
  setDrawerFastChargeTime,
  fastChargeSupplementName,
  setFastChargeSupplementName,
  decimalToTimeStr,
  parseTimeStrToDecimal,
  onSaveSupplements,
}) {
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
      <button type="button" onClick={onSaveSupplements} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', boxShadow: '0 0 20px rgba(168,85,247,0.4)' }}>SALVA</button>
    </div>
  );
}
