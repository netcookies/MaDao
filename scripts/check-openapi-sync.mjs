#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const ROUTER_FILE = 'crates/sms-server/src/lib.rs';
const OPENAPI_FILE = 'docs/openapi/daemon.openapi.yaml';
const CARGO_FILE = 'Cargo.toml';
const PACKAGE_FILE = 'package.json';
const ROUTE_PATTERNS = [
  '/health',
  '/auth/status',
  '/auth/check',
  '/auth/login',
  '/auth/logout',
  '/api/access-info',
  '/api/providers',
  '/api/provider-manifests',
  '/api/provider-manifests/reload',
  '/api/providers/reorder',
  '/api/routing-plans',
  '/api/routing-plans/{plan_id}',
  '/api/notifications',
  '/api/tickets',
  '/api/tickets/{ticket_id}',
  '/api/tickets/{ticket_id}/callbacks',
  '/api/settings/runtime',
  '/api/settings/runtime/regenerate-secret',
  '/api/settings/stats/sync',
  '/api/settings/stats/summary',
  '/api/settings/option-cache',
  '/api/acquire',
  '/api/poll',
  '/api/release',
  '/api/routing/failover',
  '/api/providers/{provider}/balance',
  '/api/providers/{provider}/prices',
  '/api/providers/{provider}/refresh-options',
  '/api/providers/{provider}/options-cache',
  '/api/providers/{provider}/countries',
  '/api/providers/{provider}/services',
  '/api/providers/{provider}/operators',
  '/api/providers/{provider}/manifest',
];

const OPENAPI_PATHS = [
  '/health',
  '/auth/status',
  '/auth/check',
  '/auth/login',
  '/auth/logout',
  '/api/access-info',
  '/api/providers',
  '/api/provider-manifests',
  '/api/provider-manifests/reload',
  '/api/providers/reorder',
  '/api/routing-plans',
  '/api/routing-plans/{plan_id}',
  '/api/notifications',
  '/api/tickets',
  '/api/tickets/{ticket_id}',
  '/api/tickets/{ticket_id}/callbacks',
  '/api/settings/runtime',
  '/api/settings/runtime/regenerate-secret',
  '/api/settings/stats/sync',
  '/api/settings/stats/summary',
  '/api/settings/option-cache',
  '/api/acquire',
  '/api/poll',
  '/api/release',
  '/api/routing/failover',
  '/api/providers/{provider}/balance',
  '/api/providers/{provider}/prices',
  '/api/providers/{provider}/refresh-options',
  '/api/providers/{provider}/options-cache',
  '/api/providers/{provider}/countries',
  '/api/providers/{provider}/services',
  '/api/providers/{provider}/operators',
  '/api/providers/{provider}/manifest',
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const routerSource = readFileSync(ROUTER_FILE, 'utf8');
const openapiSource = readFileSync(OPENAPI_FILE, 'utf8');
const cargoSource = readFileSync(CARGO_FILE, 'utf8');
const packageSource = JSON.parse(readFileSync(PACKAGE_FILE, 'utf8'));

const workspaceVersion = cargoSource.match(/\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/)?.[1];
if (!workspaceVersion) {
  fail('Unable to read workspace version from Cargo.toml.');
}

const openapiVersion = openapiSource.match(/^\s*version:\s*([^\s]+)\s*$/m)?.[1];
if (!openapiVersion) {
  fail('Unable to read OpenAPI version.');
}

if (openapiVersion !== workspaceVersion) {
  fail(`OpenAPI version ${openapiVersion} does not match workspace version ${workspaceVersion}.`);
}

if (packageSource.version !== workspaceVersion) {
  fail(`package.json version ${packageSource.version} does not match workspace version ${workspaceVersion}.`);
}

for (const route of ROUTE_PATTERNS) {
  if (!routerSource.includes(`"${route}"`)) {
    fail(`Missing route in router source: ${route}`);
  }
}

const openapiPathBlock = openapiSource.match(/paths:\n([\s\S]*?)\ncomponents:/);
if (!openapiPathBlock) {
  fail('Unable to locate paths block in OpenAPI spec.');
}

for (const route of OPENAPI_PATHS) {
  if (!openapiPathBlock[1].includes(`  ${route}:`)) {
    fail(`Missing path in OpenAPI spec: ${route}`);
  }
}

process.stdout.write('openapi sync ok\n');
