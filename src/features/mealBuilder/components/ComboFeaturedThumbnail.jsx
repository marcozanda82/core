import React from 'react';
import { resolveFoodVisual } from '../utils/foodIconUtils';
import FoodVisualMedia from './FoodVisualMedia';

const Z_INDEX = ['z-[3]', 'z-[2]', 'z-[1]'];

export default function ComboFeaturedThumbnail({ items = [], personalDb, className = '' }) {
  const topItems = items.slice(0, 3);

  if (topItems.length === 0) {
    return (
      <div className={`mr-3 flex shrink-0 ${className}`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-800 bg-slate-700">
          <span className="text-sm" aria-hidden>
            🍽️
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`mr-3 flex shrink-0 -space-x-2 ${className}`}>
      {topItems.map((item, index) => {
        const visual = resolveFoodVisual(item, personalDb);
        const key = `${visual.name}-${index}`;

        return (
          <div
            key={key}
            className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-slate-800 bg-slate-700 ${Z_INDEX[index] ?? 'z-[1]'}`}
            title={visual.name}
          >
            <FoodVisualMedia
              visual={visual}
              name={visual.name}
              compact
              iconClassName="h-4 w-4"
              wrapperClassName="h-full w-full"
              className="rounded-full"
              emojiClassName="text-sm"
              imageClassName="h-full w-full object-cover"
            />
          </div>
        );
      })}
    </div>
  );
}
