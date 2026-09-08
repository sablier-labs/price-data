import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, mock, test } from "node:test";
import axios from "axios";
import { fetchDailyForexRates, fetchRateForDate } from "./frankfurter-client.js";
import { updateTsvFile } from "./tsv-utils.js";

const INVALID_RESPONSE = /Invalid Frankfurter response/;
const MISSING_RATE = /previous 7 days/;
const OPERATIONAL_ERROR = /HTTP 503/;

afterEach(() => mock.restoreAll());

function mockRate(data: unknown) {
  return mock.method(axios, "get", () => Promise.resolve({ data }));
}

function notFound() {
  return { isAxiosError: true, response: { status: 404 } };
}

test("requests GBP/USD from ECB and accepts the preceding business day", async () => {
  const request = mockRate({ base: "GBP", date: "2026-08-28", quote: "USD", rate: 1.3583 });
  assert.equal(await fetchRateForDate("2026-08-30"), 1.3583);
  assert.equal(
    request.mock.calls[0].arguments[0],
    "https://api.frankfurter.dev/v2/rate/GBP/USD?date=2026-08-30&providers=ECB"
  );
  assert.deepEqual(request.mock.calls[0].arguments[1], { timeout: 10_000 });
});

test("walks backward on 404 and accepts the seven-day boundary", async () => {
  const request = mockRate({ base: "GBP", date: "2026-08-24", quote: "USD", rate: 1.35 });
  request.mock.mockImplementationOnce(() => Promise.reject(notFound()));
  assert.equal(await fetchRateForDate("2026-08-31"), 1.35);
  const fallbackUrl = request.mock.calls[1].arguments[0];
  assert.ok(typeof fallbackUrl === "string" && fallbackUrl.includes("date=2026-08-30"));
});

for (const override of [
  { date: "2026-09-01" },
  { date: "2026-08-23" },
  { date: "bad" },
  { base: "USD" },
  { quote: "EUR" },
  { rate: "1.35" },
  { rate: 0 },
  { rate: -1 },
  { rate: Number.NaN },
  { rate: Number.POSITIVE_INFINITY },
]) {
  test(`rejects invalid response ${JSON.stringify(override)}`, async () => {
    const request = mockRate({
      base: "GBP",
      date: "2026-08-31",
      quote: "USD",
      rate: 1.35,
      ...override,
    });
    await assert.rejects(fetchRateForDate("2026-08-31"), INVALID_RESPONSE);
    assert.equal(request.mock.callCount(), 1);
  });
}

test("does not extend the original target's lookback window after a 404", async () => {
  const request = mockRate({ base: "GBP", date: "2026-08-23", quote: "USD", rate: 1.35 });
  request.mock.mockImplementationOnce(() => Promise.reject(notFound()));
  await assert.rejects(fetchRateForDate("2026-08-31"), INVALID_RESPONSE);
});

test("fails after eight missing dates and does not hide operational errors", async () => {
  const request = mock.method(axios, "get", () => Promise.reject(notFound()));
  await assert.rejects(fetchRateForDate("2026-08-31"), MISSING_RATE);
  assert.equal(request.mock.callCount(), 8);
  request.mock.mockImplementation(() => Promise.reject(new Error("HTTP 503")));
  await assert.rejects(fetchRateForDate("2026-08-31"), OPERATIONAL_ERROR);
  assert.equal(request.mock.callCount(), 9);
});

test("fills only missing dates, preserves saved rates and is idempotent", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ecb-forex-test-"));
  mock.method(process, "cwd", () => directory);
  try {
    const saved = Array.from({ length: 30 }, (_, offset) => ({
      date: `2026-08-${String(offset + 1).padStart(2, "0")}`,
      rate: 1.25,
    }));
    updateTsvFile(saved);
    const request = mockRate({ base: "GBP", date: "2026-08-31", quote: "USD", rate: 1.3539 });
    const additions = await fetchDailyForexRates(2026, 8);
    assert.deepEqual(additions, [{ date: "2026-08-31", rate: 1.3539 }]);
    updateTsvFile(additions);
    const content = readFileSync(join(directory, "forex/GBP_USD.tsv"), "utf8");
    assert.ok(content.includes('"2026-08-25"\t1.25'));
    assert.deepEqual(await fetchDailyForexRates(2026, 8), []);
    assert.equal(request.mock.callCount(), 1);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
