import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { DEFAULT_UI_STATE } from '../lib/uiPersistence';

export function useUiSection(section) {
  const { uiState, patchUi } = useApp();
  const value = uiState[section] ?? DEFAULT_UI_STATE[section];

  const update = useCallback(
    (patch) => patchUi(section, patch),
    [patchUi, section],
  );

  return [value, update];
}
