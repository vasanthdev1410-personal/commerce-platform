const INDIA_STATES: Record<string, string> = {
  ANDHRAPRADESH: 'AP',
  ARUNACHALPRADESH: 'AR',
  ASSAM: 'AS',
  BIHAR: 'BR',
  CHHATTISGARH: 'CG',
  GOA: 'GA',
  GUJARAT: 'GJ',
  HARYANA: 'HR',
  HIMACHALPRADESH: 'HP',
  JHARKHAND: 'JH',
  KARNATAKA: 'KA',
  KERALA: 'KL',
  MADHYAPRADESH: 'MP',
  MAHARASHTRA: 'MH',
  MANIPUR: 'MN',
  MEGHALAYA: 'ML',
  MIZORAM: 'MZ',
  NAGALAND: 'NL',
  ODISHA: 'OD',
  ORISSA: 'OD',
  PUNJAB: 'PB',
  RAJASTHAN: 'RJ',
  SIKKIM: 'SK',
  TAMILNADU: 'TN',
  TELANGANA: 'TS',
  TRIPURA: 'TR',
  UTTARPRADESH: 'UP',
  UTTARAKHAND: 'UK',
  UTTARANCHAL: 'UK',
  WESTBENGAL: 'WB',
  ANDAMANANDNICOBARISLANDS: 'AN',
  CHANDIGARH: 'CH',
  DADRAANDNAGARHAVELIANDDAMANANDDIU: 'DH',
  DELHI: 'DL',
  NEWDELHI: 'DL',
  JAMMUANDKASHMIR: 'JK',
  LADAKH: 'LA',
  LAKSHADWEEP: 'LD',
  PUDUCHERRY: 'PY',
  PONDICHERRY: 'PY',
};

const INDIA_CODES = new Set(Object.values(INDIA_STATES));

const compact = (value: string): string =>
  value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export function normalizeIndianState(value: string): string | null {
  const normalized = compact(value);
  if (INDIA_CODES.has(normalized)) return normalized;
  return INDIA_STATES[normalized] ?? null;
}

export function normalizeSubdivision(
  countryCode: string,
  value: string,
): string | null {
  if (countryCode.trim().toUpperCase() === 'IN') {
    return normalizeIndianState(value);
  }
  const normalized = compact(value);
  return /^[A-Z0-9]{2,3}$/.test(normalized) ? normalized : null;
}
