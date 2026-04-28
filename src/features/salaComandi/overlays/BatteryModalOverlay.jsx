import React from 'react';

export default function BatteryModalOverlay({ showBatteryModal, BodyBatteryModalComponent, onClose, batteryData }) {
  if (!showBatteryModal) return null;
  return <BodyBatteryModalComponent onClose={onClose} batteryData={batteryData} />;
}
