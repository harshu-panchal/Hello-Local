import { useEffect } from 'react';

/**
 * Locks background (body) scrolling while a modal/sheet/overlay is open.
 * Restores the previous overflow value on close/unmount.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [locked]);
}
