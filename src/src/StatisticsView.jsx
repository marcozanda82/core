import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { TARGETS } from './useBiochimico';

function WeeklyBar({ label, current, dailyTarget, unit }) {
  const target = (Number(dailyTarget) || 1) * 7;
  const percent = Math.min((current / target) * 100, 100);
  const isOver = current > target * 1.5;
  return (
    <div key={label} style={{ marginBottom: '10px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.65rem',
          color: '#888',
          marginBottom: '4px',
          textTransform: 'uppercase',
        }}
      >
        <span>{label}</span>
        <span style={{ color: isOver ? '#ff3d00' : '#ccc' }}>
          {Math.round(current)} / {Math.round(target)} {unit}
        </span>
      </div>
      <div style={{ height: '5px', background: '#222', borderRadius: '3px', overflow: 'hidden' }}>
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            background: isOver ? '#ff3d00' : percent >= 100 ? '#00e676' : '#b388ff',
            transition: 'width 0.5s',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Bilancio kcal ultimi 7 giorni + trend calorico + micros settimanali (spostati dalla vista Storico).
 */
export default function StatisticsView({
  pastDaysStorico = [],
  weeklyTrendData = [],
  weeklyMicrosTotals = null,
  userTargets = null,
  kcalReferenceLine = 2300,
}) {
  const historyArray = pastDaysStorico || [];
  const last7Days = historyArray.slice(0, 7);
  let sumKcalIn = 0;
  let sumKcalTarget = 0;
  last7Days.forEach((day) => {
    const assunte = day.calorie ?? day.totali?.kcal ?? day.kcalAssunte ?? 0;
    const target =
      day.calorie != null && day.deficit != null
        ? day.calorie - day.deficit
        : day.userTargets?.kcal ?? day.targetKcal ?? 2500;
    sumKcalIn += assunte;
    sumKcalTarget += target;
  });
  const diffKcal = Math.round(sumKcalIn - sumKcalTarget);
  const isSurplus = diffKcal > 0;
  const avgDiffKcal = last7Days.length > 0 ? Math.round(diffKcal / last7Days.length) : 0;

  const micros = weeklyMicrosTotals || {
    fatTotal: 0,
    omega3: 0,
    omega6: 0,
    vitA: 0,
    vitD: 0,
    vitE: 0,
    vitK: 0,
    vitB12: 0,
  };

  const refK = Number(kcalReferenceLine) > 0 ? Number(kcalReferenceLine) : 2300;

  return (
    <div style={{ marginBottom: 28 }}>
      {last7Days.length > 0 && (
        <div
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '15px',
            padding: '20px',
            marginBottom: '20px',
            border: `1px solid ${isSurplus ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 230, 118, 0.4)'}`,
          }}
        >
          <h3 style={{ color: '#fff', margin: '0 0 15px 0', fontSize: '1.1rem', textAlign: 'center' }}>
            ⚖️ Bilancio Ultimi 7 Giorni
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#aaa' }}>Totale Assunto</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>{Math.round(sumKcalIn)}</div>
            </div>
            <div
              style={{
                textAlign: 'center',
                padding: '0 15px',
                borderLeft: '1px solid #333',
                borderRight: '1px solid #333',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '5px' }}>Esito Settimanale</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: isSurplus ? '#ef4444' : '#00e676' }}>
                {isSurplus ? '+' : ''}
                {diffKcal} <span style={{ fontSize: '0.9rem' }}>kcal</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: isSurplus ? '#ef4444' : '#00e676', marginTop: '5px' }}>
                Media: {isSurplus ? '+' : ''}
                {avgDiffKcal} kcal / giorno
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#aaa' }}>Totale Target</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>{Math.round(sumKcalTarget)}</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '0.8rem', color: '#888' }}>
            {isSurplus
              ? "Sei in Surplus calorico. Ideale per la costruzione muscolare, attenzione all'accumulo di grasso se eccessivo."
              : 'Sei in Deficit calorico. Ideale per la definizione o perdita di peso.'}
          </div>
        </div>
      )}

      {weeklyTrendData.length > 0 && (() => {
        const totalDeepFastingHours = weeklyTrendData.reduce(
          (acc, d) => acc + (d.maxFastingHours != null && d.maxFastingHours > 12 ? d.maxFastingHours - 12 : 0),
          0,
        );
        return (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 15px',
              borderRadius: '12px',
              border: '1px solid rgba(156, 39, 176, 0.4)',
              background: 'rgba(156, 39, 176, 0.08)',
            }}
          >
            <h4 style={{ fontSize: '0.7rem', color: '#ce93d8', letterSpacing: '1px', marginBottom: '8px' }}>
              Digiuno Settimanale
            </h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#e1bee7' }}>
              Negli ultimi 7 giorni:{' '}
              <strong style={{ color: '#ffea00' }}>{totalDeepFastingHours.toFixed(1)} h</strong> in digiuno profondo
              (Chetosi/Autofagia, &gt;12 h consecutive).
            </p>
          </div>
        );
      })()}

      <div
        style={{
          marginBottom: '24px',
          background: 'rgba(255,255,255,0.02)',
          padding: '15px',
          borderRadius: '12px',
          border: '1px solid #2a2a2a',
        }}
      >
        <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '15px' }}>
          TREND CALORICO ULTIMI 7 GIORNI
        </h4>
        {weeklyTrendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weeklyTrendData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
              <XAxis dataKey="shortDate" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                domain={[0, (min, max) => (max ?? 0) + 200]}
                tick={{ fill: '#666', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{
                  backgroundColor: '#111',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                }}
              />
              <ReferenceLine y={refK} stroke="rgba(0, 229, 255, 0.4)" strokeDasharray="3 3" />
              <Bar dataKey="calorie" fill="#b0bec5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic', textAlign: 'center' }}>
            Dati insufficienti per il trend settimanale.
          </p>
        )}
      </div>

      {weeklyTrendData.length > 0 && userTargets && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '8px' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
            <h4 style={{ fontSize: '0.65rem', color: '#ffea00', letterSpacing: '1px', marginBottom: '15px' }}>
              GRASSI (7 GIORNI)
            </h4>
            <WeeklyBar
              label="Grassi Totali"
              current={micros.fatTotal}
              dailyTarget={userTargets.fatTotal ?? TARGETS.macro.fatTotal}
              unit="g"
            />
            <WeeklyBar
              label="Omega 3"
              current={micros.omega3}
              dailyTarget={userTargets.omega3 ?? TARGETS.fat.omega3}
              unit="g"
            />
            <WeeklyBar label="Omega 6" current={micros.omega6} dailyTarget={TARGETS.fat.omega6} unit="g" />
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
            <h4 style={{ fontSize: '0.65rem', color: '#00e676', letterSpacing: '1px', marginBottom: '15px' }}>
              ACCUMULABILI (LIPO + B12)
            </h4>
            <WeeklyBar label="Vitamina A" current={micros.vitA} dailyTarget={TARGETS.vit.vitA} unit="µg" />
            <WeeklyBar
              label="Vitamina D"
              current={micros.vitD}
              dailyTarget={userTargets.vitD ?? TARGETS.vit.vitD}
              unit="µg"
            />
            <WeeklyBar label="Vitamina E" current={micros.vitE} dailyTarget={TARGETS.vit.vitE} unit="mg" />
            <WeeklyBar label="Vitamina K" current={micros.vitK} dailyTarget={TARGETS.vit.vitK} unit="µg" />
            <WeeklyBar label="Vitamina B12" current={micros.vitB12} dailyTarget={TARGETS.vit.vitB12} unit="µg" />
          </div>
        </div>
      )}
    </div>
  );
}
