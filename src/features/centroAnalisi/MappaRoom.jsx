import React from 'react';
import StrumentazioneToolRoom from './StrumentazioneToolRoom';

/** Stanza Mappa — vista MAP di MetabolicUnifiedView (read-only). */
export default function MappaRoom({ store, onSwitchRoom = null }) {
  return (
    <StrumentazioneToolRoom
      store={store}
      activeTool="MAP"
      label="Mappa"
      onSwitchRoom={onSwitchRoom}
    />
  );
}
