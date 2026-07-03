import { useCallback, useEffect, useState } from 'react';
import { getDefaultHomeLayout } from '../config/homeLayoutDefaults';

export function useHomeLayoutDesign(isPro) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [layoutConfig, setLayoutConfig] = useState(() => getDefaultHomeLayout(isPro));

  useEffect(() => {
    setLayoutConfig(getDefaultHomeLayout(isPro));
    setIsEditMode(false);
  }, [isPro]);

  const toggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  const updateBlockPosition = useCallback((id, x, y) => {
    setLayoutConfig((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, x: Math.round(x), y: Math.round(y) } : block
      )
    );
  }, []);

  const hideBlock = useCallback((id) => {
    setLayoutConfig((prev) =>
      prev.map((block) => (block.id === id ? { ...block, visible: false } : block))
    );
  }, []);

  const resetLayout = useCallback(() => {
    setLayoutConfig(getDefaultHomeLayout(isPro));
  }, [isPro]);

  const getBlockConfig = useCallback(
    (id) => {
      const block = layoutConfig.find((b) => b.id === id);
      return block ?? { id, x: 0, y: 0, visible: true };
    },
    [layoutConfig]
  );

  const exportLayoutJson = useCallback(() => {
    const payload = layoutConfig.map(({ id, x, y, visible }) => ({
      id,
      x,
      y,
      visible: visible !== false,
    }));
    const json = JSON.stringify(payload, null, 2);
    console.log('[KentuOS Home Layout]', json);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json).catch((err) => {
        console.warn('[KentuOS Home Layout] Clipboard non disponibile:', err);
      });
    }
  }, [layoutConfig]);

  return {
    isEditMode,
    toggleEditMode,
    layoutConfig,
    setLayoutConfig,
    updateBlockPosition,
    hideBlock,
    resetLayout,
    getBlockConfig,
    exportLayoutJson,
  };
}
