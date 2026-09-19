import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatSleepClock } from '../utils/sleepReference';
import { SALUTE_FROST, SALUTE_SLEEP_CHART } from '../utils/saluteVisualTheme';

/**
 * Presentation layer `/salute` del Ghost 14 giorni.
 * Stessa serie di `buildSleepTrendChartData` / `SaluteSleepGhostCard`,
 * senza modificare il componente della vecchia Salute.
 */
export default function SaluteSleepGhostChart({
  sleepData = [],
  ghostHours = null,
  avg14Days = null,
} = {}) {
  const ghost = Number.isFinite(Number(ghostHours)) ? Number(ghostHours) : null;
  const avg14 = Number.isFinite(Number(avg14Days)) ? Number(avg14Days) : null;

  const chartData = useMemo(() => {
    if (!Array.isArray(sleepData) || sleepData.length === 0) return [];
    return sleepData.map((row) => ({
      date: row.date,
      hours: Number.isFinite(Number(row.hours)) ? Number(row.hours) : null,
    }));
  }, [sleepData]);

  const yMax = useMemo(() => {
    const vals = chartData
      .map((d) => d.hours)
      .filter((h) => Number.isFinite(h));
    const peak = Math.max(ghost ?? 0, avg14 ?? 0, ...vals, 8);
    return Math.max(10, Math.ceil((peak + 1) * 2) / 2);
  }, [chartData, ghost, avg14]);

  return (
    <section
      className={`relative overflow-hidden rounded-[22px] border border-white/12 p-3.5 sm:p-4 ${SALUTE_FROST.card}`}
      aria-label="Il tuo sonno ultimi 14 giorni"
    >
      <span
        className={SALUTE_FROST.sheen}
        aria-hidden
      />
      <div className="relative">
      <p className="m-0 text-[13px] font-medium tracking-tight text-violet-100">
        Il tuo sonno · ultimi 14 giorni
      </p>
      <p className="m-0 mt-1 text-[12px] leading-relaxed text-slate-400">
        Linea di riferimento
        {ghost != null ? ` ${formatSleepClock(ghost)}` : ''}
        . Le barre sono le notti registrate.
      </p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-medium uppercase tracking-[0.08em]">
        <span className="inline-flex items-center gap-1.5 text-cyan-300">
          <span className="h-1.5 w-3 rounded-sm bg-cyan-400" aria-hidden />
          Sonno
        </span>
        <span className="inline-flex items-center gap-1.5 text-violet-300">
          <span className="h-px w-3 border-t border-dashed border-violet-300" aria-hidden />
          Riferimento
        </span>
      </div>
      <div className="mt-3 h-[168px] w-full min-w-0 sm:h-[196px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 12, right: 10, left: -6, bottom: 0 }}
              barCategoryGap="18%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={10}
              />
              <YAxis
                domain={[0, yMax]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                width={30}
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip
                cursor={{ fill: 'rgba(34,211,238,0.06)' }}
                contentStyle={{
                  background: '#151D2B',
                  border: '1px solid rgba(167,139,250,0.28)',
                  borderRadius: 12,
                  fontSize: 12,
                  color: '#f8fafc',
                }}
                formatter={(value, name) => {
                  if (name === 'hours' && value == null) return ['—', 'Sonno'];
                  if (name === 'hours') return [`${formatSleepClock(value)}`, 'Sonno'];
                  return [value, name];
                }}
              />
              {ghost != null ? (
                <ReferenceLine
                  y={ghost}
                  stroke={SALUTE_SLEEP_CHART.ghost}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  ifOverflow="extendDomain"
                  label={{
                    value: 'Riferimento',
                    position: 'insideTopRight',
                    fill: SALUTE_SLEEP_CHART.ghost,
                    fontSize: 10,
                  }}
                />
              ) : null}
              {avg14 != null ? (
                <ReferenceLine
                  y={avg14}
                  stroke={SALUTE_SLEEP_CHART.average}
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                  label={{
                    value: 'Media 14',
                    position: 'insideTopLeft',
                    fill: 'rgba(148,163,184,0.85)',
                    fontSize: 10,
                  }}
                />
              ) : null}
              <Bar
                dataKey="hours"
                name="hours"
                fill={SALUTE_SLEEP_CHART.actual}
                fillOpacity={0.88}
                radius={[4, 4, 0, 0]}
                maxBarSize={14}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="hours"
                name="trend"
                stroke={SALUTE_SLEEP_CHART.actual}
                strokeWidth={1.6}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
                activeDot={{ r: 3, fill: '#67e8f9' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-slate-400">
            Nessun sonno registrato negli ultimi 14 giorni
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
