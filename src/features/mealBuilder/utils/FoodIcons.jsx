import React from 'react';
import {
  GiBread,
  GiBroccoli,
  GiCheeseWedge,
  GiChickenLeg,
  GiCoffeeCup,
  GiCupcake,
  GiEggClutch,
  GiFishCooked,
  GiFruitBowl,
  GiMilkCarton,
  GiNoodles,
  GiOlive,
  GiShrimp,
  GiSteak,
  GiWaterBottle,
} from 'react-icons/gi';
import { FaBowlFood } from 'react-icons/fa6';

export const FOOD_ICONS_LIBRARY = [
  { id: 'meat', label: 'Carne', icon: GiSteak, color: 'text-red-400' },
  { id: 'poultry', label: 'Pollame', icon: GiChickenLeg, color: 'text-amber-400' },
  { id: 'fish', label: 'Pesce', icon: GiFishCooked, color: 'text-sky-400' },
  { id: 'seafood', label: 'Frutti di mare', icon: GiShrimp, color: 'text-orange-400' },
  { id: 'bread', label: 'Pane', icon: GiBread, color: 'text-yellow-300' },
  { id: 'pasta', label: 'Pasta', icon: GiNoodles, color: 'text-amber-200' },
  { id: 'fruit', label: 'Frutta', icon: GiFruitBowl, color: 'text-pink-400' },
  { id: 'vegetables', label: 'Verdura', icon: GiBroccoli, color: 'text-green-400' },
  { id: 'dairy', label: 'Latticini', icon: GiMilkCarton, color: 'text-blue-300' },
  { id: 'cheese', label: 'Formaggio', icon: GiCheeseWedge, color: 'text-yellow-400' },
  { id: 'eggs', label: 'Uova', icon: GiEggClutch, color: 'text-yellow-200' },
  { id: 'oil', label: 'Olio', icon: GiOlive, color: 'text-lime-400' },
  { id: 'sweets', label: 'Dolci', icon: GiCupcake, color: 'text-fuchsia-400' },
  { id: 'drinks', label: 'Bevande', icon: GiWaterBottle, color: 'text-cyan-400' },
  { id: 'coffee', label: 'Caffè', icon: GiCoffeeCup, color: 'text-amber-600' },
  { id: 'bowl', label: 'Piatto', icon: FaBowlFood, color: 'text-slate-300' },
];

const FOOD_ICON_BY_ID = Object.fromEntries(
  FOOD_ICONS_LIBRARY.map((entry) => [entry.id, entry]),
);

export function getFoodIconEntry(iconId) {
  if (!iconId) return null;
  return FOOD_ICON_BY_ID[String(iconId)] ?? null;
}

export function FoodIconVisual({
  iconId,
  iconClassName = 'h-7 w-7',
  wrapperClassName = 'h-full w-full',
  className = '',
}) {
  const entry = getFoodIconEntry(iconId);
  if (!entry) return null;

  const Icon = entry.icon;

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-slate-900/90 ring-1 ring-slate-700/60 ${wrapperClassName} ${className}`}
      aria-hidden
    >
      <Icon className={`${entry.color} ${iconClassName}`} />
    </div>
  );
}
