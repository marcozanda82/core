import React from 'react';
import { getFoodEmoji } from '../utils/foodIconUtils';

export default function FoodThumbnail({
  name,
  customImage,
  sizeClassName = 'h-10 w-10',
  emojiClassName = 'text-xl',
  className = '',
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-800 ${sizeClassName} ${className}`}
    >
      {customImage ? (
        <img
          src={customImage}
          alt={name || 'Alimento'}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className={emojiClassName} aria-hidden>
          {getFoodEmoji(name)}
        </span>
      )}
    </div>
  );
}
