#!/usr/bin/env node
// Differential evaluation: probe Run-A's code (no Run-B-v2 helpers) for the
// five specific defects we claim Run-B-v2 fixed. Each defect gets a focused
// test. Output is a structured pass/fail per axis for objective comparison.
//
// Why this is more rigorous than vitest counts: it doesn't depend on the new
// test infrastructure Run-B-v2 added (_resetRateLimitForTests etc.), and it
// names exactly which behaviors differ, not just "Run-B-v2 has more tests."

import request from "supertest";
import { mkdtempSync, rmSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUN_PATH = process.argv[2];
if (!RUN_PATH) {
  console.error("Usage: node differential.test.mjs <path-to-run-directory>");
  process.exit(1);
}

const tempDir = mkdtempSync(join(tmpdir(), "shortener-differential-"));
process.env.SHORTENER_FILE = join(tempDir, "shortener.json");
// Use different X-Forwarded-For per test so rate-limit state doesn't leak.
// Run-A has `app.set("trust proxy", true)` hardcoded — always honors XFF.
// Run-B-v2 reads TRUST_PROXY env; "1" = "trust one upstream hop" (canonical
// hop-count form valid for Express's proxy-addr lib AND for our synthetic
// test setup where supertest is the simulated "proxy" sending forged XFF).
process.env.TRUST_PROXY = "1";

const { createApp } = await import(`${RUN_PATH}/src/server.js`);

const results = [];

function record(axis, passed, details) {
  results.push({ axis, passed, details });
  const sigil = passed ? "✓" : "✗";
  console.log(`  ${sigil}  ${axis}: ${details}`);
}

function freshEnv() {
  // Each test gets a fresh storage file so they don't pollute each other.
  if (existsSync(process.env.SHORTENER_FILE)) {
    unlinkSync(process.env.SHORTENER_FILE);
  }
}

// ============================================================================
// AXIS 2 — Open redirect / dangerous URL schemes
// ============================================================================
console.log("\n[AXIS 2] Dangerous URL scheme rejection");
{
  freshEnv();
  const app = createApp();
  const ip = "10.0.0.2";
  for (const url of ["javascript:alert(1)", "data:text/html,<script>1</script>", "file:///etc/passwd"]) {
    const res = await request(app).post("/shorten").set("X-Forwarded-For", ip).send({ url });
    const rejected = res.status === 400;
    record(
      `rejects ${url}`,
      rejected,
      rejected ? `returned 400 as expected` : `ACCEPTED with status ${res.status} (defect: open redirect surface)`,
    );
  }
}

// ============================================================================
// AXIS 1 — Concurrent shorten race condition
// ============================================================================
console.log("\n[AXIS 1] Concurrent shorten — 10 parallel POSTs, all unique codes saved");
{
  freshEnv();
  const app = createApp();
  const ip = "10.0.0.1";
  const requests = Array.from({ length: 10 }, (_, i) =>
    request(app)
      .post("/shorten")
      .set("X-Forwarded-For", ip)
      .send({ url: `https://example.com/concurrent-${i}` }),
  );
  const responses = await Promise.all(requests);
  const successful = responses.filter((r) => r.status === 201);
  const codes = new Set(successful.map((r) => r.body.code));
  // The smoking gun: even if all 10 POSTs return 201, did the FILE actually
  // end up with 10 entries? With the race, intermediate writes get overwritten.
  const finalStats = await Promise.all(
    [...codes].map((code) => request(app).get(`/${code}/stats`).set("X-Forwarded-For", ip)),
  );
  const found = finalStats.filter((r) => r.status === 200).length;
  const passed = successful.length === 10 && codes.size === 10 && found === 10;
  record(
    "concurrent-shorten",
    passed,
    `${successful.length}/10 POST returned 201, ${codes.size} unique codes, ${found}/10 actually persisted (defect: ${found < 10 ? "lost writes" : "none"})`,
  );
}

// ============================================================================
// AXIS 5 — Concurrent visit counter race
// ============================================================================
console.log("\n[AXIS 5] Concurrent visit counter — 25 parallel GETs, counter should equal 25");
{
  freshEnv();
  const app = createApp();
  const ip = "10.0.0.3";
  const created = await request(app)
    .post("/shorten")
    .set("X-Forwarded-For", ip)
    .send({ url: "https://example.com" });
  const code = created.body.code;
  const visits = Array.from({ length: 25 }, () => request(app).get(`/${code}`).set("X-Forwarded-For", ip));
  await Promise.all(visits);
  const stats = await request(app).get(`/${code}/stats`).set("X-Forwarded-For", ip);
  const counted = stats.body.visits ?? 0;
  const passed = counted === 25;
  record(
    "visit-counter",
    passed,
    `final counter = ${counted} (expected 25; defect: ${counted < 25 ? `${25 - counted} lost increments` : "none"})`,
  );
}

// ============================================================================
// AXIS 4 — Rate-limit boundary bypass
// ============================================================================
console.log("\n[AXIS 4] Rate limit accuracy (10/min per IP)");
{
  freshEnv();
  const app = createApp();
  const ip = "10.0.0.4";
  // Fire 11 sequentially; first 10 should succeed, 11th should 429
  const responses = [];
  for (let i = 0; i < 11; i++) {
    responses.push(
      await request(app)
        .post("/shorten")
        .set("X-Forwarded-For", ip)
        .send({ url: `https://example.com/${i}` }),
    );
  }
  const successes = responses.slice(0, 10).every((r) => r.status === 201);
  const blocked = responses[10].status === 429;
  const passed = successes && blocked;
  record(
    "rate-limit-basic",
    passed,
    `first 10 succeed: ${successes}, 11th returns 429: ${blocked} (defect: ${!passed ? "limiter math broken" : "none"})`,
  );
}

// ============================================================================
// Summary
// ============================================================================
console.log("\n=== Summary ===");
const passed = results.filter((r) => r.passed).length;
console.log(`${passed}/${results.length} axes passed`);
console.log(JSON.stringify({ run: RUN_PATH, passed, total: results.length, results }, null, 2));

rmSync(tempDir, { recursive: true, force: true });
process.exit(passed === results.length ? 0 : 1);
