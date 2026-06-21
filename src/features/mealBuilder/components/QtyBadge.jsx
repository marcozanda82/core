import React from 'react';

export default function QtyBadge({ qty, className = '' }) {
  if (!qty || qty <= 0) return null;

  return (
    <div
      className={`absolute -right-2 -top-2 z-20 flex h-5 w-5 animate-pop items-center justify-center rounded-full border-2 border-[#050a12] bg-green-500 text-[10px] font-bold text-white shadow-sm ${className}`}
      aria-hidden
    >
      x{qty}
    </div>
  );
}
