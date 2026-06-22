import React from 'react';
import { getFoodEmoji } from '../utils/foodIconUtils';
import { FoodIconVisual } from '../utils/FoodIcons';

export default function FoodThumbnail({
  name,
  customImage,
  customEmoji,
  customIcon = null,
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
      ) : customIcon ? (
        <FoodIconVisual
          iconId={customIcon}
          iconClassName="h-[55%] w-[55%]"
          wrapperClassName="h-full w-full rounded-md"
        />
      ) : (
        <span className={emojiClassName} aria-hidden>
          {customEmoji || getFoodEmoji(name)}
        </span>
      )}
    </div>
  );
}
