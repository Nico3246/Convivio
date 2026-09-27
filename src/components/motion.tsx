import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

const ReducedMotionContext = createContext(true);

/** One system preference shared by both navigators; static until it is known. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      receivedEvent = true;
      if (active) setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active && !receivedEvent) setReduced(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return <ReducedMotionContext.Provider value={reduced}>{children}</ReducedMotionContext.Provider>;
}

export const useReducedMotion = () => useContext(ReducedMotionContext);

const mainSections = new Set([
  'home',
  'coexistence',
  'house',
  'shopping',
  'money',
  'faults',
  'complaints',
  'visits',
]);

export function screenTransition(params: object | undefined, reduced: boolean) {
  if (reduced) return 'none' as const;
  const value = params && 'route' in params ? params.route : undefined;
  const name: unknown = Array.isArray(value) ? value[0] : value;
  return typeof name === 'string' && mainSections.has(name)
    ? ('fade' as const)
    : ('slide_from_right' as const);
}
