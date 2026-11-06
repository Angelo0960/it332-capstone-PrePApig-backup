const PSA_SERIES_ID = '0032M4AFN12';
const PRICE_SOURCE_URL =
  `https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2M/NFG/${PSA_SERIES_ID}.px`;
const BATANGAS_PSGC = '0401000000';
const CAVITE_PSGC = '0402100000';
const PSA_HOG_FARMGATE_SOURCE_URL = `https://openstat.psa.gov.ph/PXWeb/pxweb/en/DB/DB__2M__NFG/${PSA_SERIES_ID}.px/`;
const PRICE_SOURCE_LOCATIONS = ['Lemery', 'Calaca', 'Tuy', 'Balayan', 'Lian', 'Nasugbu', 'Taal'];
const CALACA_FACEBOOK_URL = 'https://www.facebook.com/share/1HmN99yxmE/';

const FACEBOOK_PRICE_SOURCES = PRICE_SOURCE_LOCATIONS.map((location) => ({
  location,
  source: 'Facebook public search (manual verification required)',
  url: location === 'Calaca'
    ? CALACA_FACEBOOK_URL
    : `https://www.facebook.com/public/${encodeURIComponent(`${location} Batangas baboy presyo`)}`,
  status: 'unverified',
}));
const CALACA_FACEBOOK_PRICE_POINT = {
  location: 'Calaca',
  province: 'Batangas',
  pricePhpPerKg: 152.5,
  priceMinPhpPerKg: 150,
  priceMaxPhpPerKg: 155,
  priceAveragePhpPerKg: 152.5,
  priceType: 'liveweight',
  unit: 'PHP/kg liveweight',
  period: '2026-10-30',
  observedDate: '2026-10-30',
  source: 'Calaca City Veterinary Office Facebook post',
  sourceUrl: CALACA_FACEBOOK_URL,
  status: 'partially_verified',
  verificationStatus: 'user-provided-screenshot',
  sourceKind: 'user_provided_reference',
  evidence: 'Live weight hog price: PHP 150.00–155.00 per kilo as of October 30, 2026. Information attributed to hog agents and haulers.',
  sourceType: 'User-provided Facebook screenshot; verify the buyer offer before selling',
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cache = { expiresAt: 0, value: null };
let inFlightRequest = null;

const parseCsvLine = (line) => {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }

  values.push(value);
  return values;
};

const parseCsv = (csv) => {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {});
  });
};

const toPriceRecord = (row, provinceName, preliminary = false) => ({
  location: `${provinceName} province`,
  province: provinceName,
  source: 'Philippine Statistics Authority (PSA) OpenSTAT province-level farmgate average (official API)',
  sourceUrl: row.source_url || PSA_HOG_FARMGATE_SOURCE_URL,
  period: row.period,
  date: row.date,
  observedDate: row.date,
  pricePhpPerKg: Number(row.value),
  unit: row.unit,
  priceType: 'province-level farmgate average/liveweight',
  series: row.series || PSA_SERIES_ID,
  sourceAccessedOn: row.accessed_on || null,
  sourceType: 'official_statistic',
  sourceKind: 'official_statistic',
  status: 'official_reference',
  dataStatus: preliminary ? 'preliminary' : 'published',
  verificationStatus: 'official_source',
  note: `PSA publishes this value for ${provinceName} province, not for an individual municipality or buyer.${preliminary ? ' This quarter is marked preliminary by PSA.' : ''}`,
});

const isCurrentLatestQuarterPreliminary = (period, now) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const currentDate = new Date(now);
  const currentYear = currentDate.getUTCFullYear();
  const currentQuarter = Math.floor(currentDate.getUTCMonth() / 3) + 1;
  const previousQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const previousQuarterYear = currentQuarter === 1 ? currentYear - 1 : currentYear;
  return year === previousQuarterYear && Math.ceil(month / 3) === previousQuarter;
};

export const fetchBatangasPigPrice = async ({ fetchImpl = fetch, now = Date.now() } = {}) => {
  if (cache.value && cache.expiresAt > now) return cache.value;
  if (inFlightRequest) return inFlightRequest;

  inFlightRequest = (async () => {
    const fetchWithTimeout = async (url, options = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        return await fetchImpl(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    };

    const metadataResponse = await fetchWithTimeout(PRICE_SOURCE_URL);
    if (!metadataResponse.ok) {
      throw new Error(`PSA OpenSTAT metadata returned HTTP ${metadataResponse.status}`);
    }
    const metadata = await metadataResponse.json();
    const getVariable = (code) => metadata.variables?.find((variable) => variable.code === code);
    const geolocationVariable = getVariable('Geolocation');
    const typeVariable = getVariable('Type');
    const yearVariable = getVariable('Year');
    const monthVariable = getVariable('Month');
    if (!geolocationVariable || !typeVariable || !yearVariable || !monthVariable) {
      throw new Error('PSA OpenSTAT table is missing a required dimension');
    }

    const currentYear = new Date(now).getUTCFullYear();
    const yearCodes = yearVariable.values.filter((code, index) => {
      const year = Number(yearVariable.valueTexts[index]);
      return Number.isFinite(year) && year <= currentYear;
    });
    const hogTypeIndex = typeVariable.valueTexts.findIndex((value) => value === 'Hog for Slaughter');
    const hogTypeCode = typeVariable.values[hogTypeIndex];
    const monthCodes = monthVariable.values.filter((code, index) => monthVariable.valueTexts[index] !== 'Annual');
    const provinceNames = [
      ['Batangas', BATANGAS_PSGC],
      ['Cavite', CAVITE_PSGC],
    ];
    const geolocationCodes = provinceNames.map(([, code]) => code);

    if (!hogTypeCode || yearCodes.length === 0 || monthCodes.length === 0) {
      throw new Error('PSA OpenSTAT table has no selectable hog price periods');
    }

    const query = {
      query: [
        { code: 'Geolocation', selection: { filter: 'item', values: geolocationCodes } },
        { code: 'Type', selection: { filter: 'item', values: [hogTypeCode] } },
        { code: 'Year', selection: { filter: 'item', values: yearCodes } },
        { code: 'Month', selection: { filter: 'item', values: monthCodes } },
      ],
      response: { format: 'csv' },
    };
    const dataResponse = await fetchWithTimeout(PRICE_SOURCE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/csv' },
      body: JSON.stringify(query),
    });
    if (!dataResponse.ok) {
      throw new Error(`PSA OpenSTAT price query returned HTTP ${dataResponse.status}`);
    }

    const allRows = parseCsv(await dataResponse.text());
    const headers = allRows.length > 0 ? Object.keys(allRows[0]) : [];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const accessedOn = new Date(now).toISOString();
    const getProvinceRows = (provinceName, geoCode) => {
      const geoIndex = geolocationVariable.values.indexOf(geoCode);
      const geoLabel = geolocationVariable.valueTexts[geoIndex]?.replace(/^\.+/, '');
      const row = allRows.find((candidate) => (
        candidate.Geolocation?.replace(/^\.+/, '') === geoLabel
        && candidate.Type === 'Hog for Slaughter'
      ));
      if (!row) return [];

      return headers.slice(2).flatMap((periodHeader) => {
        const match = /^(\d{4})\s+(.+)$/.exec(periodHeader);
        if (!match) return [];
        const year = Number(match[1]);
        const month = monthNames.indexOf(match[2]) + 1;
        const value = Number(String(row[periodHeader] || '').replace(/,/g, ''));
        if (!month || !Number.isFinite(value) || value <= 0) return [];
        const period = `${year}-${String(month).padStart(2, '0')}`;
        return [{
          period,
          date: period,
          value,
          unit: 'PHP/kg liveweight',
          series: PSA_SERIES_ID,
          source_url: PSA_HOG_FARMGATE_SOURCE_URL,
          accessed_on: accessedOn,
          province: provinceName,
        }];
      }).sort((left, right) => right.period.localeCompare(left.period));
    };

    const rows = getProvinceRows('Batangas', BATANGAS_PSGC);
    const caviteRows = getProvinceRows('Cavite', CAVITE_PSGC);
    if (rows.length === 0) {
      throw new Error('No Batangas hog farmgate price record was found in the PSA OpenSTAT response');
    }

    const priceRows = rows.slice(0, 6).map((row) => (
      toPriceRecord(row, 'Batangas', isCurrentLatestQuarterPreliminary(row.period, now))
    ));
    const latest = priceRows[0];
    const caviteBenchmark = caviteRows[0]
      ? toPriceRecord(caviteRows[0], 'Cavite', isCurrentLatestQuarterPreliminary(caviteRows[0].period, now))
      : null;
    const provinceBenchmarks = [latest, caviteBenchmark].filter(Boolean);
    const values = priceRows.map((record) => record.pricePhpPerKg);
    const averagePricePhpPerKg = values.reduce((sum, value) => sum + value, 0) / values.length;

    const result = {
      success: true,
      data: latest,
      priceSourceLocations: PRICE_SOURCE_LOCATIONS,
      pricePoints: [CALACA_FACEBOOK_PRICE_POINT, ...provinceBenchmarks],
      provinceBenchmarks,
      facebookPriceSources: FACEBOOK_PRICE_SOURCES,
      basis: priceRows,
      basisSummary: {
        records: priceRows.length,
        averagePricePhpPerKg: Number(averagePricePhpPerKg.toFixed(2)),
        lowestPricePhpPerKg: Math.min(...values),
        highestPricePhpPerKg: Math.max(...values),
        direction:
          priceRows.length > 1 && latest.pricePhpPerKg > priceRows[1].pricePhpPerKg
            ? 'up'
            : priceRows.length > 1 && latest.pricePhpPerKg < priceRows[1].pricePhpPerKg
              ? 'down'
              : 'stable',
      },
      analysisInput: {
        location: latest.location,
        unit: latest.unit,
        prices: priceRows.map(({ period, pricePhpPerKg }) => ({ period, pricePhpPerKg })),
        instruction:
          'Describe the published price observations, diagnose source coverage and recency without mixing different geographies or periods, and prescribe practical checks before selling. Keep Calaca user-provided liveweight references separate from PSA Batangas and Cavite province-level farmgate averages. Do not present provincial averages as municipality buyer offers, and do not invent prices or financial outcomes.',
      },
      fetchedAt: accessedOn,
      cacheExpiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
    };

    cache = { expiresAt: now + CACHE_TTL_MS, value: result };
    return result;
  })();

  try {
    return await inFlightRequest;
  } finally {
    inFlightRequest = null;
  }
};

export const clearPigPriceCache = () => {
  cache = { expiresAt: 0, value: null };
  inFlightRequest = null;
};

export { PRICE_SOURCE_URL, PSA_SERIES_ID, BATANGAS_PSGC, CAVITE_PSGC, PSA_HOG_FARMGATE_SOURCE_URL, CALACA_FACEBOOK_URL, CALACA_FACEBOOK_PRICE_POINT, parseCsv };
