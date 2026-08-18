import React from 'react';
import StrumentazioneToolRoom from './StrumentazioneToolRoom';

/** Stanza Bussola — vista COMPASS di MetabolicUnifiedView (read-only). */
export default function BussolaRoom({ store, onSwitchRoom = null }) {
  return (
    <StrumentazioneToolRoom
      store={store}
      activeTool="COMPASS"
      label="Bussola"
      onSwitchRoom={onSwitchRoom}
    />
  );
}
