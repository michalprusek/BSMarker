/**
 * Shared modal state management hook for BSMarker
 * Provides consistent modal behavior across the application
 */

import { useState, useCallback } from "react";

export interface UseModalReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useModal = (initialState: boolean = false): UseModalReturn => {
  const [isOpen, setIsOpen] = useState(initialState);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
};

// Hook for managing multiple modals
export interface MultiModalState {
  [key: string]: boolean;
}

export const useMultiModal = (modalKeys: string[]) => {
  const initialState = modalKeys.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as MultiModalState);

  const [modals, setModals] = useState<MultiModalState>(initialState);

  const open = useCallback((key: string) => {
    setModals((prev) => ({
      ...prev,
      [key]: true,
    }));
  }, []);

  const close = useCallback((key: string) => {
    setModals((prev) => ({
      ...prev,
      [key]: false,
    }));
  }, []);

  const toggle = useCallback((key: string) => {
    setModals((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const closeAll = useCallback(() => {
    setModals(
      modalKeys.reduce((acc, key) => {
        acc[key] = false;
        return acc;
      }, {} as MultiModalState),
    );
  }, [modalKeys]);

  const isAnyOpen = Object.values(modals).some((state) => state);

  return {
    modals,
    open,
    close,
    toggle,
    closeAll,
    isAnyOpen,
  };
};
