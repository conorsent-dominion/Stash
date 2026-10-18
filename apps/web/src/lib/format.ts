const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });

export function relativeDate(iso: string, now = Date.now()): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const diffSeconds = Math.round((timestamp - now) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 60) return 'только что';
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 604_800) return rtf.format(Math.round(diffSeconds / 86_400), 'day');

  return new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'short',
    year: new Date(iso).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
  }).format(new Date(iso));
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || 'Б';
}

const GRADIENTS = [
  'from-sky-400 via-blue-500 to-indigo-600',
  'from-emerald-400 via-teal-500 to-cyan-600',
  'from-amber-400 via-orange-500 to-rose-500',
  'from-violet-400 via-purple-500 to-fuchsia-600',
  'from-rose-400 via-pink-500 to-red-500',
];

export function gradientFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 997;
  }
  return GRADIENTS[hash % GRADIENTS.length] ?? GRADIENTS[0]!;
}
