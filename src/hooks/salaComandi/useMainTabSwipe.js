/**
 * Gesture swipe orizzontale tra i tab principali (bottom nav).
 */

import { useCallback, useRef, useState } from 'react';
import { MAIN_BOTTOM_TAB_ORDER } from '../../constants/salaComandiConstants';

/**
 * @param {{
 *   activeBottomTab?: string,
 *   setActiveBottomTab?: (tab: string) => void,
 * }} params
 */
export function useMainTabSwipe({
  activeBottomTab = 'oggi',
  setActiveBottomTab = null,
} = {}) {
  const [slideDirection, setSlideDirection] = useState('slide-none');
  const [, setMainTabTouchStartX] = useState(null);
  const [, setMainTabTouchEndX] = useState(null);
  const mainTabTouchStartXRef = useRef(null);
  const mainTabTouchEndXRef = useRef(null);
  const mainTabTouchStartYRef = useRef(null);
  const mainTabTouchEndYRef = useRef(null);
  const mainTabSwipeIgnoreRef = useRef(false);

  const handleMainTabTouchStart = useCallback((e) => {
    const el = e.target;
    if (el && typeof el.closest === 'function') {
      if (el.closest('.chart-scroll-container') || el.closest('.mini-timeline-hitbox') || el.closest('.home-oggi-macros') || el.closest('.home-training-carousel')) {
        mainTabSwipeIgnoreRef.current = true;
        return;
      }
    }
    mainTabSwipeIgnoreRef.current = false;
    const touch = e.targetTouches[0];
    if (!touch) return;
    setMainTabTouchEndX(null);
    mainTabTouchEndXRef.current = null;
    setMainTabTouchStartX(touch.clientX);
    mainTabTouchStartXRef.current = touch.clientX;
    mainTabTouchStartYRef.current = touch.clientY;
    mainTabTouchEndYRef.current = touch.clientY;
  }, []);

  const handleMainTabTouchMove = useCallback((e) => {
    if (mainTabSwipeIgnoreRef.current) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      return;
    }
    const touch = e.targetTouches[0];
    if (!touch) return;
    setMainTabTouchEndX(touch.clientX);
    mainTabTouchEndXRef.current = touch.clientX;
    mainTabTouchEndYRef.current = touch.clientY;
  }, []);

  const handleMainTabTouchEnd = useCallback(
    (e) => {
      if (mainTabSwipeIgnoreRef.current) {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        mainTabSwipeIgnoreRef.current = false;
        setMainTabTouchStartX(null);
        setMainTabTouchEndX(null);
        mainTabTouchStartXRef.current = null;
        mainTabTouchEndXRef.current = null;
        return;
      }
      const startX = mainTabTouchStartXRef.current;
      const endX = mainTabTouchEndXRef.current ?? e.changedTouches?.[0]?.clientX ?? null;
      const startY = mainTabTouchStartYRef.current;
      const endY = mainTabTouchEndYRef.current ?? e.changedTouches?.[0]?.clientY ?? null;
      setMainTabTouchStartX(null);
      setMainTabTouchEndX(null);
      mainTabTouchStartXRef.current = null;
      mainTabTouchEndXRef.current = null;

      if (startX == null || endX == null) return;

      const minSwipeDistance = 50;
      const distance = startX - endX;
      const absDx = Math.abs(distance);
      const absDy = Math.abs((startY ?? 0) - (endY ?? 0));
      if (absDx < minSwipeDistance) return;
      if (absDx <= absDy * 1.25) return;

      const idx = MAIN_BOTTOM_TAB_ORDER.indexOf(activeBottomTab);
      if (idx < 0) return;

      if (distance > minSwipeDistance) {
        if (idx < MAIN_BOTTOM_TAB_ORDER.length - 1) {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(15);
          }
          setSlideDirection('slide-left');
          setActiveBottomTab?.(MAIN_BOTTOM_TAB_ORDER[idx + 1]);
        }
      } else if (distance < -minSwipeDistance) {
        if (idx > 0) {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(15);
          }
          setSlideDirection('slide-right');
          setActiveBottomTab?.(MAIN_BOTTOM_TAB_ORDER[idx - 1]);
        }
      }
    },
    [activeBottomTab, setActiveBottomTab],
  );

  const handleMainTabTouchCancel = useCallback((e) => {
    if (mainTabSwipeIgnoreRef.current && typeof e?.stopPropagation === 'function') {
      e.stopPropagation();
    }
    mainTabSwipeIgnoreRef.current = false;
    setMainTabTouchStartX(null);
    setMainTabTouchEndX(null);
    mainTabTouchStartXRef.current = null;
    mainTabTouchEndXRef.current = null;
  }, []);

  return {
    slideDirection,
    setSlideDirection,
    handleMainTabTouchStart,
    handleMainTabTouchMove,
    handleMainTabTouchEnd,
    handleMainTabTouchCancel,
  };
}

export default useMainTabSwipe;
