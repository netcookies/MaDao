const BASE_URL = 'https://5sim.net/v1';

function parseArgs(argv) {
  const args = {
    product: '',
    country: '',
    limit: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--product' || token === '-p') {
      args.product = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--country' || token === '-c') {
      args.country = argv[index + 1] ?? '';
      index += 1;
    } else if (token === '--limit' || token === '-l') {
      const parsed = Number(argv[index + 1] ?? '20');
      args.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
      index += 1;
    }
  }

  if (!args.product.trim()) {
    throw new Error('Missing required --product <service>.');
  }

  return args;
}

async function fetchJson(path, query = {}) {
  const url = new URL(`${BASE_URL}/${path.replace(/^\//, '')}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value != null && String(value).trim() !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url.pathname}${url.search}: ${text.slice(0, 200)}`);
  }
}

async function fetchCountriesMap() {
  return fetchJson('guest/countries');
}

async function fetchPricesByProduct(product, country) {
  return fetchJson('guest/prices', { product, country });
}

async function fetchProducts(country, operator) {
  return fetchJson(`guest/products/${country}/${operator}`);
}

function countryOperatorsFromPayload(payload) {
  return Object.keys(payload).filter((key) => !['iso', 'prefix', 'text_en', 'text_ru'].includes(key));
}

async function main() {
  const { product, country, limit } = parseArgs(process.argv.slice(2));
  const countriesMap = await fetchCountriesMap();
  const pricesPayload = await fetchPricesByProduct(product, country);

  const priceRoot = country
    ? (pricesPayload[country] ?? {})[product] ?? {}
    : pricesPayload[product] ?? {};

  const countries = country ? [country] : Object.keys(priceRoot);
  const report = [];

  for (const countryName of countries) {
    const countryPayload = countriesMap[countryName];
    if (!countryPayload) {
      report.push({
        country: countryName,
        issue: 'missing_country_in_guest_countries',
      });
      continue;
    }

    const operatorKeys = countryOperatorsFromPayload(countryPayload);
    const priceOperators = Object.keys(country ? ((pricesPayload[countryName] ?? {})[product] ?? {}) : (priceRoot[countryName] ?? {}));

    const operatorRows = [];
    for (const operator of operatorKeys) {
      let productsJson = null;
      let productsError = null;
      try {
        productsJson = await fetchProducts(countryName, operator);
      } catch (error) {
        productsError = String(error);
      }

      const hasProductInProducts = !!productsJson && typeof productsJson === 'object' && Object.hasOwn(productsJson, product);
      const priceEntry = country
        ? ((pricesPayload[countryName] ?? {})[product] ?? {})[operator]
        : (priceRoot[countryName] ?? {})[operator];
      const hasProductInPrices = priceEntry != null;

      if (hasProductInProducts || hasProductInPrices || productsError) {
        operatorRows.push({
          operator,
          in_prices: hasProductInPrices,
          in_products: hasProductInProducts,
          price_count: priceEntry?.count ?? null,
          price_cost: priceEntry?.cost ?? null,
          products_error: productsError,
        });
      }
    }

    const onlyInPrices = operatorRows.filter((row) => row.in_prices && !row.in_products);
    const onlyInProducts = operatorRows.filter((row) => row.in_products && !row.in_prices);
    const productEndpointErrors = operatorRows.filter((row) => row.products_error);

    report.push({
      country: countryName,
      operators_in_country_map: operatorKeys.length,
      operators_in_prices: priceOperators.length,
      only_in_prices: onlyInPrices.slice(0, limit),
      only_in_products: onlyInProducts.slice(0, limit),
      product_endpoint_errors: productEndpointErrors.slice(0, limit),
    });
  }

  const summary = {
    product,
    country: country || null,
    checked_countries: report.length,
    countries_with_price_only_gaps: report.filter((row) => row.only_in_prices?.length > 0).length,
    countries_with_products_only_gaps: report.filter((row) => row.only_in_products?.length > 0).length,
    countries_with_product_endpoint_errors: report.filter((row) => row.product_endpoint_errors?.length > 0).length,
  };

  console.log(JSON.stringify({ summary, report }, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});
