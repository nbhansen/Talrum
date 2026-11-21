import { createContext, useContext } from 'react';

interface ModalHeaderContext {
  titleId: string;
  onClose: () => void;
}

export const ModalContext = createContext<ModalHeaderContext | null>(null);

/** The title id and close handler of the enclosing Modal, for its header. */
export const useModalHeader = (): ModalHeaderContext => {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('DialogHeader used outside a Modal.');
  return ctx;
};
