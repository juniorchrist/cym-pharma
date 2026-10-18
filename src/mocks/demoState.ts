// Gestion d'état réactive pour le mode démo

let isDemoMode = false;
const listeners = new Set<(active: boolean) => void>();

export function getDemoMode(): boolean {
  return isDemoMode;
}

export function setDemoMode(active: boolean): void {
  if (isDemoMode !== active) {
    isDemoMode = active;
    listeners.forEach((fn) => {
      try {
        fn(active);
      } catch (err) {
        console.error('DemoMode listener error:', err);
      }
    });
  }
}

export function subscribeDemoMode(fn: (active: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
