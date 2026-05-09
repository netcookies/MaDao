import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const rawPath = path.join(cwd, 'config', 'provider-options-raw.json');
const cachePath = path.join(cwd, 'config', 'provider-options-cache.json');
const outputPath = path.join(cwd, '.workflow', 'scratch', 'provider-mapping-report', '06-canonical-candidates.json');

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[/_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isMostlyCodeLike(value) {
  const token = normalize(value);
  if (!token) return false;
  if (/^\d+$/.test(token)) return true;
  return token.length <= 3;
}

function indexCanonicalByProviderValue(items) {
  const index = new Map();
  for (const item of items ?? []) {
    const providerValue = normalize(item.provider_value ?? item.value);
    if (!providerValue) continue;
    if (!index.has(providerValue)) {
      index.set(providerValue, {
        canonical: normalize(item.value),
        label: String(item.label ?? ''),
      });
    }
  }
  return index;
}

function buildCandidates() {
  const raw = loadJson(rawPath);
  const cache = loadJson(cachePath);

  const serviceCandidates = [];
  const countryCandidates = [];

  for (const [providerId, rawEntry] of Object.entries(raw.entries ?? {})) {
    const cacheEntry = cache.entries?.[providerId]?.options;
    const serviceIndex = indexCanonicalByProviderValue(cacheEntry?.services);
    const countryIndex = indexCanonicalByProviderValue(cacheEntry?.countries);

    for (const item of rawEntry.raw_services ?? []) {
      const rawValue = normalize(item.value);
      const label = String(item.label ?? '').trim();
      if (!isMostlyCodeLike(rawValue)) continue;
      const mapped = serviceIndex.get(rawValue);
      if (!mapped) continue;

      const canonical = mapped.canonical;
      const looksUnresolved = canonical === rawValue;
      if (!looksUnresolved) continue;

      serviceCandidates.push({
        provider: providerId,
        raw_value: String(item.value ?? ''),
        label,
        hint: String(item.hint ?? ''),
        canonical,
        reason: 'short-or-numeric raw service code remains canonical as-is',
      });
    }

    for (const item of rawEntry.raw_countries ?? []) {
      const rawValue = normalize(item.value);
      const label = String(item.label ?? '').trim();
      const hint = String(item.hint ?? '').trim();
      if (!/^\d+$/.test(rawValue)) continue;
      const mapped = countryIndex.get(rawValue);
      if (!mapped) continue;
      const canonical = mapped.canonical;
      if (canonical === rawValue) {
        countryCandidates.push({
          provider: providerId,
          raw_value: String(item.value ?? ''),
          label,
          hint,
          canonical,
          reason: 'numeric raw country id remains canonical as-is',
        });
      }
    }
  }

  const summarize = (items, keyField) => {
    const bucket = new Map();
    for (const item of items) {
      const key = `${item[keyField]}|${item.label}`;
      if (!bucket.has(key)) {
        bucket.set(key, {
          key: item[keyField],
          label: item.label,
          count: 0,
          providers: new Set(),
          samples: [],
        });
      }
      const record = bucket.get(key);
      record.count += 1;
      record.providers.add(item.provider);
      if (record.samples.length < 5) record.samples.push(item);
    }
    return [...bucket.values()]
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .map((item) => ({
        key: item.key,
        label: item.label,
        count: item.count,
        providers: [...item.providers].sort(),
        samples: item.samples,
      }));
  };

  return {
    generated_at: new Date().toISOString(),
    service_unresolved: summarize(serviceCandidates, 'raw_value'),
    country_unresolved: summarize(countryCandidates, 'raw_value'),
  };
}

const report = buildCandidates();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`wrote ${outputPath}`);
console.log(`service candidates: ${report.service_unresolved.length}`);
console.log(`country candidates: ${report.country_unresolved.length}`);
