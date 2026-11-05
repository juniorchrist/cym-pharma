import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseLiveResourceOptions {
  /** Intervalle d'interrogation en millisecondes (défaut : 20 000 ms) */
  intervalMs?: number;
  /** Active l'interrogation automatique en tâche de fond */
  enabled?: boolean;
  /** Nom du canal BroadcastChannel pour la synchronisation multi-onglets instantanée */
  channelName?: string;
  /** Type d'événement écouté sur le canal */
  eventType?: string;
}

export interface UseLiveResourceResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

/**
 * Hook générique et robuste de gestion des données synchronisées en direct.
 *
 * Règles intégrées :
 * - Interrogation périodique (polling) suspendue automatiquement si l'onglet est masqué
 * - Rechargement immédiat au retour de visibilité de l'onglet (`visibilitychange` / `focus`)
 * - Rechargement immédiat lors du rétablissement de la connexion (`online`)
 * - Réception d'événements inter-onglets instantanés via BroadcastChannel
 * - Gestion automatique de l'annulation (`AbortController`) pour éviter les fuites de mémoire
 */
export function useLiveResource<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseLiveResourceOptions = {}
): UseLiveResourceResult<T> {
  const {
    intervalMs = 20000,
    enabled = true,
    channelName = 'cym_orders_channel',
    eventType,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const executeFetch = useCallback(
    async (silent: boolean = false) => {
      if (!enabled) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (!silent) setLoading(true);

      try {
        const result = await fetcher(controller.signal);
        if (isMountedRef.current && !controller.signal.aborted) {
          setData(result);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (err: any) {
        if (isMountedRef.current && !controller.signal.aborted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMountedRef.current && !controller.signal.aborted && !silent) {
          setLoading(false);
        }
      }
    },
    [key, enabled, fetcher]
  );

  useEffect(() => {
    isMountedRef.current = true;

    // Chargement initial
    executeFetch(false);

    if (!enabled) {
      return () => {
        isMountedRef.current = false;
        abortControllerRef.current?.abort();
      };
    }

    // Polling régulier conditionné par la visibilité du document
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        executeFetch(true);
      }
    }, intervalMs);

    // Reprise immédiate au focus ou réaffichage de l'onglet
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        executeFetch(true);
      }
    };

    const handleOnline = () => {
      executeFetch(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    // Écoute BroadcastChannel pour synchronisation inter-onglets instantanée
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        bc = new BroadcastChannel(channelName);
        bc.onmessage = (event) => {
          if (!eventType || event.data?.type === eventType) {
            executeFetch(true);
          }
        };
      }
    } catch {
      // Ignorer si BroadcastChannel n'est pas disponible
    }

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
      abortControllerRef.current?.abort();
    };
  }, [executeFetch, intervalMs, enabled, channelName, eventType]);

  const refresh = useCallback(async () => {
    await executeFetch(false);
  }, [executeFetch]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}

