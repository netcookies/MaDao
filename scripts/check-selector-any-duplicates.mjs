import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const cachePath = path.join(repoRoot, 'config', 'provider-options-cache.json');

function normalizeDedupKey(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'any' ? '' : normalized;
}

function summarizeOption(item) {
  return {
    value: item.value ?? '',
    label: item.label ?? '',
    hint: item.hint ?? '',
    provider_value: item.provider_value ?? '',
  };
}

function analyzeOptionSet(items) {
  const anyLike = items.filter((item) => {
    const value = String(item.value ?? '').trim().toLowerCase();
    const providerValue = String(item.provider_value ?? '').trim().toLowerCase();
    return value === '' || value === 'any' || providerValue === '' || providerValue === 'any';
  });

  const deduped = [];
  const seen = new Set();
  for (const item of anyLike) {
    const key = normalizeDedupKey(item.value);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return {
    raw_count: anyLike.length,
    deduped_count: deduped.length,
    raw_items: anyLike.map(summarizeOption),
    deduped_items: deduped.map(summarizeOption),
  };
}

function main() {
  if (!fs.existsSync(cachePath)) {
    throw new Error(`Missing cache file: ${cachePath}`);
  }

  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const report = [];

  for (const [providerId, entry] of Object.entries(cache.entries ?? {})) {
    const options = entry.options ?? {};
    report.push({
      provider: providerId,
      countries: analyzeOptionSet(options.countries ?? []),
      operators: analyzeOptionSet(options.operators ?? []),
    });
  }

  const summary = {
    providers_checked: report.length,
    providers_with_country_any_duplicates: report.filter((item) => item.countries.raw_count > item.countries.deduped_count).length,
    providers_with_operator_any_duplicates: report.filter((item) => item.operators.raw_count > item.operators.deduped_count).length,
  };

  console.log(JSON.stringify({ summary, report }, null, 2));
}

main();
