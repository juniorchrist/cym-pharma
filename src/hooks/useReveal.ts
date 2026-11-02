import { useEffect } from 'react';

/**
 * Observes elements with class .reveal and adds .in when visible in viewport.
 * Uses threshold: 0 and rootMargin for instant detection.
 * Includes a safety fallback timer (600ms) ensuring content is NEVER permanently
 * hidden on mobile Safari / WebKit or older devices.
 * Complies with prefers-reduced-motion.
 */
export function useReveal(): void {
  useEffect(() => {
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const elements = document.querySelectorAll<HTMLElement>('.reveal');

    const revealAll = () => {
      document.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
        el.classList.add('in');
      });
    };

    if (isReduced || elements.length === 0) {
      revealAll();
      return;
    }

    // Safety net: reveal all elements after 600ms so nothing is ever stuck invisible
    const safetyTimeout = window.setTimeout(revealAll, 600);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0,
        rootMargin: '100px 0px 100px 0px',
      }
    );

    elements.forEach((el) => observer.observe(el));

    // Also trigger on first scroll or touch
    const handleInteraction = () => {
      revealAll();
      window.removeEventListener('scroll', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
    window.addEventListener('scroll', handleInteraction, { passive: true, once: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true, once: true });

    return () => {
      window.clearTimeout(safetyTimeout);
      window.removeEventListener('scroll', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      observer.disconnect();
    };
  }, []);
}
