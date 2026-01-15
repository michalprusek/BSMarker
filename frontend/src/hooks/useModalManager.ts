/**
 * useModalManager - Centralized modal state management
 *
 * Consolidates multiple modal useState declarations into a single hook.
 * Provides consistent API for opening/closing modals with optional
 * mutual exclusivity (only one modal open at a time).
 */

import { useState, useCallback, useMemo } from 'react';

export type ModalKey =
  | 'label'
  | 'sidebar'
  | 'defaultLabelInput'
  | 'customLabelInput'
  | 'keyboardShortcuts'
  | 'bottomLine'
  | 'contrast'
  | 'zoomInput';

type ModalState = Record<ModalKey, boolean>;

interface UseModalManagerOptions {
  mutuallyExclusive?: boolean;
  initialState?: Partial<ModalState>;
}

interface ModalManagerReturn {
  isOpen: (key: ModalKey) => boolean;
  open: (key: ModalKey) => void;
  close: (key: ModalKey) => void;
  toggle: (key: ModalKey) => void;
  closeAll: () => void;
  isAnyOpen: boolean;
  currentModal: ModalKey | null;
  state: ModalState;
}

const MODAL_KEYS: ModalKey[] = [
  'label',
  'sidebar',
  'defaultLabelInput',
  'customLabelInput',
  'keyboardShortcuts',
  'bottomLine',
  'contrast',
  'zoomInput',
];

function createClosedState(): ModalState {
  return Object.fromEntries(MODAL_KEYS.map(key => [key, false])) as ModalState;
}

export function useModalManager(
  options: UseModalManagerOptions = {}
): ModalManagerReturn {
  const { mutuallyExclusive = false, initialState = {} } = options;

  const [modalState, setModalState] = useState<ModalState>(() => ({
    ...createClosedState(),
    ...initialState,
  }));

  const isOpen = useCallback(
    (key: ModalKey): boolean => modalState[key],
    [modalState]
  );

  const open = useCallback(
    (key: ModalKey) => {
      setModalState(prev =>
        mutuallyExclusive
          ? { ...createClosedState(), [key]: true }
          : { ...prev, [key]: true }
      );
    },
    [mutuallyExclusive]
  );

  const close = useCallback((key: ModalKey) => {
    setModalState(prev => ({ ...prev, [key]: false }));
  }, []);

  const toggle = useCallback(
    (key: ModalKey) => {
      setModalState(prev => {
        const willOpen = !prev[key];
        if (mutuallyExclusive && willOpen) {
          return { ...createClosedState(), [key]: true };
        }
        return { ...prev, [key]: willOpen };
      });
    },
    [mutuallyExclusive]
  );

  const closeAll = useCallback(() => {
    setModalState(createClosedState);
  }, []);

  const isAnyOpen = useMemo(
    () => Object.values(modalState).some(Boolean),
    [modalState]
  );

  const currentModal = useMemo((): ModalKey | null => {
    const entry = Object.entries(modalState).find(([, open]) => open);
    return entry ? (entry[0] as ModalKey) : null;
  }, [modalState]);

  return {
    isOpen,
    open,
    close,
    toggle,
    closeAll,
    isAnyOpen,
    currentModal,
    state: modalState,
  };
}

export default useModalManager;
