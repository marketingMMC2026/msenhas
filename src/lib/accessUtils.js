export const normalizeUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export const getHostname = (link) => {
  try {
    return new URL(normalizeUrl(link)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export const getFaviconUrl = (link) => {
  const hostname = getHostname(link);
  if (!hostname) return '';
  return `https://${hostname}/favicon.ico`;
};

export const getAccessInitial = (title = '') => {
  const cleaned = String(title).trim();
  return (cleaned[0] || 'A').toUpperCase();
};

const accessIconThemes = [
  { bg: '#334155', text: '#f8fafc', border: '#1e293b' },
  { bg: '#365314', text: '#f7fee7', border: '#1a2e05' },
  { bg: '#4c1d95', text: '#f5f3ff', border: '#2e1065' },
  { bg: '#7f1d1d', text: '#fef2f2', border: '#450a0a' },
  { bg: '#164e63', text: '#ecfeff', border: '#083344' },
  { bg: '#713f12', text: '#fefce8', border: '#422006' },
  { bg: '#374151', text: '#f9fafb', border: '#111827' },
  { bg: '#064e3b', text: '#ecfdf5', border: '#022c22' },
  { bg: '#312e81', text: '#eef2ff', border: '#1e1b4b' },
  { bg: '#831843', text: '#fdf2f8', border: '#500724' },
];

export const getAccessIconTheme = (title = '') => {
  const source = String(title || 'A');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return accessIconThemes[hash % accessIconThemes.length];
};

export const getPasswordStrength = (password = '') => {
  const value = String(password || '');
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (/(.)\1{2,}/.test(value)) score -= 1;
  if (/^(123|abc|qwe|password|senha|admin)/i.test(value)) score -= 1;

  const normalized = Math.max(0, Math.min(score, 5));
  if (!value) return { score: 0, level: 'unknown', label: 'Nao informada', className: 'bg-gray-100 text-gray-600' };
  if (normalized <= 2) return { score: normalized, level: 'weak', label: 'Fraca', className: 'bg-red-50 text-red-700 border-red-100' };
  if (normalized <= 3) return { score: normalized, level: 'medium', label: 'Media', className: 'bg-yellow-50 text-yellow-800 border-yellow-100' };
  return { score: normalized, level: 'strong', label: 'Forte', className: 'bg-green-50 text-green-700 border-green-100' };
};

export const getPasswordStrengthLabel = (level) => {
  if (level === 'weak') return 'Fraca';
  if (level === 'medium') return 'Media';
  if (level === 'strong') return 'Forte';
  return 'Nao avaliada';
};

export const getPasswordStrengthClassName = (level) => {
  if (level === 'weak') return 'bg-red-50 text-red-700 border-red-100';
  if (level === 'medium') return 'bg-yellow-50 text-yellow-800 border-yellow-100';
  if (level === 'strong') return 'bg-green-50 text-green-700 border-green-100';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};
