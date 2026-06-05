export const MARKETPLACES = {
  US: { code: 'US', name: 'Amazon US', domain: 'https://www.amazon.com', postalCode: '10001', locale: 'en-US', languageHeader: 'en-US,en;q=0.9', currency: 'USD', regionHint: 'New York, NY' },
  CA: { code: 'CA', name: 'Amazon CA', domain: 'https://www.amazon.ca', postalCode: 'M5V 2T6', locale: 'en-CA', languageHeader: 'en-CA,en;q=0.9', currency: 'CAD', regionHint: 'Toronto, ON' },
  UK: { code: 'UK', name: 'Amazon UK', domain: 'https://www.amazon.co.uk', postalCode: 'SW1A 1AA', locale: 'en-GB', languageHeader: 'en-GB,en;q=0.9', currency: 'GBP', regionHint: 'London' },
  DE: { code: 'DE', name: 'Amazon DE', domain: 'https://www.amazon.de', postalCode: '10115', locale: 'de-DE', languageHeader: 'de-DE,de;q=0.9,en;q=0.7', currency: 'EUR', regionHint: 'Berlin' },
  FR: { code: 'FR', name: 'Amazon FR', domain: 'https://www.amazon.fr', postalCode: '75001', locale: 'fr-FR', languageHeader: 'fr-FR,fr;q=0.9,en;q=0.7', currency: 'EUR', regionHint: 'Paris' },
  IT: { code: 'IT', name: 'Amazon IT', domain: 'https://www.amazon.it', postalCode: '00118', locale: 'it-IT', languageHeader: 'it-IT,it;q=0.9,en;q=0.7', currency: 'EUR', regionHint: 'Rome' },
  ES: { code: 'ES', name: 'Amazon ES', domain: 'https://www.amazon.es', postalCode: '28001', locale: 'es-ES', languageHeader: 'es-ES,es;q=0.9,en;q=0.7', currency: 'EUR', regionHint: 'Madrid' },
  JP: { code: 'JP', name: 'Amazon JP', domain: 'https://www.amazon.co.jp', postalCode: '100-0001', locale: 'ja-JP', languageHeader: 'ja-JP,ja;q=0.9,en;q=0.7', currency: 'JPY', regionHint: 'Tokyo' },
  AU: { code: 'AU', name: 'Amazon AU', domain: 'https://www.amazon.com.au', postalCode: '2000', locale: 'en-AU', languageHeader: 'en-AU,en;q=0.9', currency: 'AUD', regionHint: 'Sydney' }
};

export function resolveMarketplace(input = {}) {
  const code = String(input.marketplaceCode || input.code || '').toUpperCase();
  const preset = MARKETPLACES[code] || MARKETPLACES.US;
  return {
    ...preset,
    code: code || preset.code,
    name: input.name || input.marketplaceName || preset.name,
    domain: String(input.domain || preset.domain).replace(/\/$/, ''),
    postalCode: input.postalCode !== undefined ? String(input.postalCode).trim() : preset.postalCode,
    locale: input.locale || preset.locale,
    languageHeader: input.languageHeader || preset.languageHeader,
    regionHint: input.regionHint || preset.regionHint,
    currency: input.currency || preset.currency
  };
}
