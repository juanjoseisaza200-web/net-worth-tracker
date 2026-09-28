import { useEffect, useState } from 'react';

const readVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Resolved iOS colors for SVG charts: recharts writes colors as SVG
 * attributes, where CSS variables aren't reliable. Re-reads on a light/dark
 * switch (system or the Appearance setting) so charts follow it.
 */
export function useIosColors() {
  const read = () => ({
    blue: readVar('--ios-blue'),
    secondary: readVar('--ios-secondary'),
    separator: readVar('--ios-separator'),
    red: readVar('--ios-red'),
    orange: readVar('--ios-orange'),
    green: readVar('--ios-green'),
    purple: readVar('--ios-purple'),
    teal: readVar('--ios-teal'),
    gray: readVar('--ios-gray'),
    indigo: readVar('--ios-indigo'),
  });
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setColors(read());
    mq.addEventListener('change', update);
    // The Appearance setting flips data-theme on <html> without a media change.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  return colors;
}
