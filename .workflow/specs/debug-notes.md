---
title: "Debug Notes"
readMode: optional
priority: medium
category: debug
keywords:
  - debug
  - issue
  - workaround
  - root-cause
  - gotcha
---

# Debug Notes

## Entries



<spec-entry category="debug" keywords="cloudflare-worker,d1,wrangler-tail,bind-null,schema-migration" date="2026-05-28" source="cloudflare/stats-worker/src/index.ts:500">

### Cloudflare D1 Worker schema and bind pitfalls

Cloudflare Worker + D1 routes can surface as Cloudflare 1101 when D1 throws inside the Worker. In the stats worker, tail showed two root causes: D1 rejected a multi-statement schema block passed through env.DB.exec with 'CREATE TABLE ... incomplete input', and D1PreparedStatement.bind rejected undefined optional filter values with 'Type undefined not supported'. For D1 Worker code, initialize schema with one prepared statement per CREATE TABLE / CREATE INDEX / ALTER TABLE operation, and normalize optional bind parameters with ?? null before binding. Keep public responses generic and log details with console.error so internal D1 errors are visible in wrangler tail but not exposed to clients. Source anchors: cloudflare/stats-worker/src/index.ts:500 and cloudflare/stats-worker/src/index.ts:642.

</spec-entry>
