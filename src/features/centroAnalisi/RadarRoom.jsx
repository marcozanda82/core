import React from 'react';
import StrumentazioneToolRoom from './StrumentazioneToolRoom';

/** Stanza Radar — vista RADAR di MetabolicUnifiedView (read-only). */
export default function RadarRoom({ store, onSwitchRoom = null }) {
  return (
    <StrumentazioneToolRoom
      store={store}
      activeTool="RADAR"
      label="Radar"
      onSwitchRoom={onSwitchRoom}
    />
  );
}
