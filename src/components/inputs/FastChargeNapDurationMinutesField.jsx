import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  parseDurationMinutesInput,
  NAP_DURATION_DEFAULT,
  NAP_DURATION_MIN,
  NAP_DURATION_MAX,
} from '../../utils/durationMinutesInput';

function computeNapDurationMin(drawerFastChargeStart, drawerFastChargeEnd) {
  let d = Number(drawerFastChargeEnd) - Number(drawerFastChargeStart);
  if (d < 0) d += 24;
  return Math.max(0, Math.round(d * 60));
}

/**
 * Campo durata pisolino: draft stringa durante la digitazione; commit su blur/salvataggio.
 */
const FastChargeNapDurationMinutesField = forwardRef(function FastChargeNapDurationMinutesField(
  { drawerFastChargeStart, setDrawerFastChargeStart, drawerFastChargeEnd, style },
  ref,
) {
  const computeDurationMin = useCallback(
    () => computeNapDurationMin(drawerFastChargeStart, drawerFastChargeEnd),
    [drawerFastChargeStart, drawerFastChargeEnd],
  );

  const [draft, setDraft] = useState(() => String(computeDurationMin()));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setDraft(String(computeDurationMin()));
  }, [computeDurationMin]);

  const commitDraft = useCallback(() => {
    const durationMin = parseDurationMinutesInput(draft, {
      min: NAP_DURATION_MIN,
      max: NAP_DURATION_MAX,
      fallback: NAP_DURATION_DEFAULT,
    });
    const fixedEnd = Number(drawerFastChargeEnd) || 0;
    let nextStart = fixedEnd - durationMin / 60;
    while (nextStart < 0) nextStart += 24;
    while (nextStart >= 24) nextStart -= 24;
    setDrawerFastChargeStart(nextStart);
    setDraft(String(durationMin));
    return durationMin;
  }, [draft, drawerFastChargeEnd, setDrawerFastChargeStart]);

  useImperativeHandle(ref, () => ({ commit: commitDraft }), [commitDraft]);

  return (
    <input
      type="number"
      min={NAP_DURATION_MIN}
      max={NAP_DURATION_MAX}
      step={5}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        commitDraft();
      }}
      style={style}
    />
  );
});

export default FastChargeNapDurationMinutesField;
