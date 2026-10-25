/**
 * Central German Formatting Utilities for Brünel ERP Platform
 * Formats:
 *  - Currency: German Euro format like "2.500,56€" (or "+2.500,56€")
 *  - Date: DD.MM.YYYY (e.g. "25.10.2026")
 *  - DateTime: DD.MM.YYYY HH:mm (e.g. "25.10.2026 14:30")
 */

/**
 * Format any number or numeric string to German Euro format: e.g. 2.500,56€
 * @param {number|string} val
 * @param {Object} [options]
 * @param {number} [options.decimals=2]
 * @param {boolean} [options.showPlus=false]
 * @param {string} [options.fallback='0,00€']
 * @returns {string} e.g. "2.500,56€" or "+450,00€"
 */
export const formatEuro = (val, options = {}) => {
  if (val === null || val === undefined || val === '') {
    return options.fallback !== undefined ? options.fallback : '0,00€';
  }
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
  if (isNaN(num)) {
    return options.fallback !== undefined ? options.fallback : '0,00€';
  }
  const decimals = options.decimals !== undefined ? options.decimals : 2;
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const sign = num < 0 ? '-' : (options.showPlus && num > 0 ? '+' : '');
  return `${sign}${formatted}€`;
};

/**
 * Format any ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss) or Date object to DD.MM.YYYY
 * @param {string|Date} val
 * @param {string} [fallback='—']
 * @returns {string} e.g. "25.10.2026"
 */
export const formatDate = (val, fallback = '—') => {
  if (!val) return fallback;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    // Match YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${d}.${m}.${y}`;
    }
    // Already in DD.MM.YYYY
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
      return trimmed;
    }
  }
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return String(val);
  }
};

/**
 * Format any ISO datetime string or Date object to DD.MM.YYYY HH:mm
 * @param {string|Date} val
 * @param {string} [fallback='—']
 * @returns {string} e.g. "25.10.2026 14:30"
 */
export const formatDateTime = (val, fallback = '—') => {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch {
    return String(val);
  }
};

/**
 * Format date range: DD.MM.YYYY – DD.MM.YYYY
 */
export const formatDateRange = (start, end, fallback = '—') => {
  if (!start && !end) return fallback;
  if (start && !end) return `${formatDate(start)} – offen`;
  if (!start && end) return `bis ${formatDate(end)}`;
  return `${formatDate(start)} – ${formatDate(end)}`;
};
