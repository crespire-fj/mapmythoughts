import { useCallback, useSyncExternalStore } from 'react';
import type { ColorMode } from './themes';

export type ColorPreference = 'system' | 'light' | 'dark';

const KEY = 'eqapmap:color-mode';
const listeners = new Set<() => void>();
const media = window.matchMedia('(prefers-color-scheme: dark)');

function readPreference(): ColorPreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

let preference = readPreference();

function resolved(): ColorMode {
  return preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
}

function apply() {
  document.documentElement.dataset.theme = resolved();
  listeners.forEach((listener) => listener());
}

media.addEventListener('change', apply);
apply();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Light/dark mode: follows the system unless the viewer picks one (remembered per browser). */
export function useColorMode() {
  const mode = useSyncExternalStore(subscribe, resolved);
  const current = useSyncExternalStore(subscribe, () => preference);
  const cycle = useCallback(() => {
    const order: ColorPreference[] = ['system', 'light', 'dark'];
    preference = order[(order.indexOf(preference) + 1) % order.length]!;
    try {
      localStorage.setItem(KEY, preference);
    } catch {
      // private mode: the choice lasts for this page only
    }
    apply();
  }, []);
  return { mode, preference: current, cycle };
}
