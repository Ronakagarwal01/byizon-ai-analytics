import { useEffect, useState } from 'react';

function readToken(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readChartTheme() {
  const text = readToken('--chart-text', readToken('--text-secondary', '#475569'));
  const muted = readToken('--chart-muted', readToken('--text-muted', '#64748b'));
  const grid = readToken('--chart-grid', 'rgba(154, 85, 47, 0.16)');
  const tooltipBg = readToken('--chart-tooltip-bg', readToken('--bg-card', '#ffffff'));
  const tooltipBorder = readToken('--chart-tooltip-border', readToken('--border-subtle', '#d9e4f2'));
  const primary = readToken('--chart-primary', readToken('--blue-500', '#9a552f'));
  const secondary = readToken('--chart-secondary', readToken('--blue-400', '#c98554'));

  return {
    grid,
    primary,
    secondary,
    tick: { fill: text, fontSize: 11 },
    mutedTick: { fill: muted, fontSize: 11 },
    legend: { color: text, fontSize: 11 },
    tooltip: {
      background: tooltipBg,
      border: `1px solid ${tooltipBorder}`,
      borderRadius: 8,
      color: readToken('--text-primary', '#0f172a'),
      fontSize: 12,
      boxShadow: readToken('--chart-tooltip-shadow', '0 16px 38px rgba(15, 23, 42, 0.12)'),
    },
  };
}

export function useChartTheme() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion(current => current + 1);
    window.addEventListener('byizon:theme-change', refresh);
    return () => window.removeEventListener('byizon:theme-change', refresh);
  }, []);

  return readChartTheme();
}
