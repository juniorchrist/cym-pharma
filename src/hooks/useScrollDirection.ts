import { useState, useEffect } from 'react';

export type ScrollDirection = 'up' | 'down';

export function useScrollDirection(threshold: number = 8): ScrollDirection {
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>('up');

  useEffect(() => {
    let lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
    let ticking = false;

    const updateScrollDir = () => {
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // Toujours visible en haut de page
      if (scrollY <= 16) {
        setScrollDirection('up');
        lastScrollY = scrollY > 0 ? scrollY : 0;
        ticking = false;
        return;
      }

      // Toujours visible dans les 80px du bas de page
      if (scrollY + windowHeight >= documentHeight - 80) {
        setScrollDirection('up');
        lastScrollY = scrollY;
        ticking = false;
        return;
      }

      // Seuil de défilement (8px par défaut)
      if (Math.abs(scrollY - lastScrollY) >= threshold) {
        setScrollDirection(scrollY > lastScrollY ? 'down' : 'up');
        lastScrollY = scrollY > 0 ? scrollY : 0;
      }

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDir);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return scrollDirection;
}
