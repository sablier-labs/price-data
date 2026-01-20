#!/usr/bin/env node

import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import ora from "ora";
import { toFloat } from "radash";
import { coinConfigs } from "../config/coins.js";
import {
  calculateDayRange,
  fetchDailyCryptoRates,
  fetchDailyCryptoRatesByRange,
} from "./fetch-crypto/coingecko-client.js";
import { updateTsvFile, updateTsvFileByDateRange } from "./fetch-crypto/tsv-utils.js";

dayjs.extend(utc);

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type FetchCryptoRatesOptions = {
  currency: string;
  month?: string;
  year?: string;
  recentDays?: string;
};

type ProcessingResult = {
  currency: string;
  month: string;
  year: string;
  newEntriesCount: number;
  status: "success" | "skipped" | "error";
  error?: string;
  tsvPath: string;
};

type AggregatedResult = {
  currency: string;
  months: string[];
  totalNewEntries: number;
  hasSuccess: boolean;
  tsvPath: string;
};

type ResultGroups = {
  successful: ProcessingResult[];
  skipped: ProcessingResult[];
  failed: ProcessingResult[];
};

type CliTable = InstanceType<typeof Table>;

/* -------------------------------------------------------------------------- */
/*                                  CONSTANTS                                 */
/* -------------------------------------------------------------------------- */

const MAX_DAYS_IN_PAST = 365; // Maximum number of days in the past to allow fetching

/* -------------------------------------------------------------------------- */
/*                                   UTILITY                                  */
/* -------------------------------------------------------------------------- */

function getDefaultYearMonth(): { month: string; year: string } {
  const now = dayjs.utc();
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // dayjs month() returns 0-11

  return {
    month: currentMonth.toString().padStart(2, "0"),
    year: currentYear.toString(),
  };
}

function getEarliestAllowedDate(): { year: number; month: number; day: number } {
  const earliest = dayjs.utc().subtract(MAX_DAYS_IN_PAST, "day").startOf("month");
  return {
    day: 1, // Always start from the first day of the month
    month: earliest.month() + 1, // dayjs month() returns 0-11
    year: earliest.year(),
  };
}

/* -------------------------------------------------------------------------- */
/*                                 VALIDATION                                 */
/* -------------------------------------------------------------------------- */

function validateCurrency(currency: string): void {
  if (currency === "all") {
    return;
  }

  if (!coinConfigs[currency]) {
    const supportedCurrencies = Object.keys(coinConfigs).join(", ");
    throw new Error(
      `Currency "${currency}" is not supported. Available currencies: ${supportedCurrencies}, all`
    );
  }
}

function validateDate(year: string, month: string): void {
  // Validate year format
  const yearNum = toFloat(year);
  if (Number.isNaN(yearNum) || year.length !== 4) {
    throw new Error("Year must be in YYYY format");
  }

  // Allow "all" for month
  if (month === "all") {
    return;
  }

  // Validate month format
  const monthNum = Number.parseInt(month, 10);
  if (Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new Error("Month must be between 01 and 12 or 'all'");
  }

  // Get earliest allowed date (365 days ago)
  const earliest = getEarliestAllowedDate();
  const requestedDate = dayjs
    .utc()
    .year(yearNum)
    .month(monthNum - 1);
  const earliestDate = dayjs
    .utc()
    .year(earliest.year)
    .month(earliest.month - 1);

  // Check if date is too far in the past
  if (requestedDate.isBefore(earliestDate)) {
    throw new Error(
      `Cannot fetch prices more than ${MAX_DAYS_IN_PAST} days in the past. ` +
        `Earliest allowed: ${earliest.year}-${earliest.month.toString().padStart(2, "0")}`
    );
  }

  // Check if date is not in the future
  const now = dayjs.utc();
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // dayjs month() returns 0-11

  if (yearNum > currentYear || (yearNum === currentYear && monthNum > currentMonth)) {
    throw new Error("Cannot fetch prices for future dates");
  }
}

/* -------------------------------------------------------------------------- */
/*                              MAIN FUNCTIONS                                */
/* -------------------------------------------------------------------------- */

function groupResults(results: ProcessingResult[]): ResultGroups {
  return {
    failed: results.filter((result) => result.status === "error"),
    skipped: results.filter((result) => result.status === "skipped"),
    successful: results.filter((result) => result.status === "success"),
  };
}

function logSummaryHeader(): void {
  console.log();
  console.log(chalk.cyan.bold("=".repeat(80)));
  console.log(chalk.cyan.bold("📊 PROCESSING SUMMARY"));
  console.log(chalk.cyan.bold("=".repeat(80)));
}

function logSummaryCounts(groups: ResultGroups): void {
  console.log(
    `${chalk.green("✅ Success:")} ${groups.successful.length} | ` +
      `${chalk.yellow("⏭️  Skipped:")} ${groups.skipped.length} | ` +
      `${chalk.red("❌ Failed:")} ${groups.failed.length}`
  );
}

function aggregateResults(results: ProcessingResult[]): AggregatedResult[] {
  const aggregatedResults = new Map<string, AggregatedResult>();

  for (const result of results) {
    if (result.status === "error") {
      continue;
    }

    const existing = aggregatedResults.get(result.currency);
    const yearMonth = `${result.year}-${result.month}`;

    if (existing) {
      existing.months.push(yearMonth);
      existing.totalNewEntries += result.newEntriesCount;
      existing.hasSuccess = existing.hasSuccess || result.status === "success";
      continue;
    }

    aggregatedResults.set(result.currency, {
      currency: result.currency,
      hasSuccess: result.status === "success",
      months: [yearMonth],
      totalNewEntries: result.newEntriesCount,
      tsvPath: result.tsvPath,
    });
  }

  return Array.from(aggregatedResults.values());
}

function createSummaryTable(): CliTable {
  return new Table({
    head: [
      chalk.cyan("Currency"),
      chalk.cyan("Period"),
      chalk.cyan("New Entries"),
      chalk.cyan("Status"),
      chalk.cyan("File Path"),
    ],
    style: {
      border: ["cyan"],
      head: ["cyan"],
    },
  });
}

function getPeriodDisplay(months: string[]): string {
  const sortedMonths = months.slice().sort();
  if (sortedMonths.length === 1) {
    return sortedMonths[0];
  }

  const lastMonth = sortedMonths.at(-1) ?? sortedMonths[0];
  return `${sortedMonths[0]} to ${lastMonth}`;
}

function renderAggregatedResults(results: ProcessingResult[]): void {
  console.log();

  const aggregatedResults = aggregateResults(results);
  const table = createSummaryTable();

  const sortedResults = aggregatedResults.sort((a, b) => a.currency.localeCompare(b.currency));

  for (const result of sortedResults) {
    const statusColor = result.hasSuccess ? chalk.green : chalk.yellow;
    const statusText = result.hasSuccess ? "Updated" : "No changes";
    const periodDisplay = getPeriodDisplay(result.months);

    table.push([
      chalk.white(result.currency),
      chalk.white(periodDisplay),
      chalk.white(result.totalNewEntries.toString()),
      statusColor(statusText),
      chalk.gray(result.tsvPath),
    ]);
  }

  console.log(table.toString());
}

function renderErrorTable(failed: ProcessingResult[]): void {
  console.log();
  console.log(chalk.red.bold("❌ ERRORS"));

  const errorTable = new Table({
    head: [chalk.red("Currency"), chalk.red("Year-Month"), chalk.red("Error")],
    style: {
      border: ["red"],
      head: ["red"],
    },
  });

  for (const result of failed) {
    errorTable.push([
      chalk.white(result.currency),
      chalk.white(`${result.year}-${result.month}`),
      chalk.gray(result.error || "Unknown error"),
    ]);
  }

  console.log(errorTable.toString());
}

function displaySummaryTable(results: ProcessingResult[]): void {
  if (results.length === 0) {
    return;
  }

  logSummaryHeader();
  const groups = groupResults(results);
  logSummaryCounts(groups);

  // Display aggregated results table
  if (groups.successful.length > 0 || groups.skipped.length > 0) {
    renderAggregatedResults(results);
  }

  // Display errors table
  if (groups.failed.length > 0) {
    renderErrorTable(groups.failed);
  }

  console.log();
}

async function fetchCryptoRatesForCurrency(
  currency: string,
  year: number,
  month: number
): Promise<ProcessingResult> {
  const yearStr = year.toString();
  const monthStr = month.toString().padStart(2, "0");

  const spinner = ora(`Fetching ${currency} prices for ${yearStr}-${monthStr}`).start();

  try {
    // Fetch prices from CoinGecko
    const cryptoRates = await fetchDailyCryptoRates(currency, year, month);

    // Update TSV file with new data
    const { newEntriesCount, tsvPath } = updateTsvFile(currency, cryptoRates, year, month);

    if (newEntriesCount > 0) {
      spinner.succeed(
        `Fetched ${currency} prices for ${yearStr}-${monthStr} (${newEntriesCount} new entries)`
      );
    } else {
      spinner.info(`No new data for ${currency} ${yearStr}-${monthStr}`);
    }

    return {
      currency,
      month: monthStr,
      newEntriesCount,
      status: newEntriesCount > 0 ? "success" : "skipped",
      tsvPath,
      year: yearStr,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.fail(`Failed to fetch ${currency} prices for ${yearStr}-${monthStr}: ${errorMessage}`);
    return {
      currency,
      error: errorMessage,
      month: monthStr,
      newEntriesCount: 0,
      status: "error",
      tsvPath: "",
      year: yearStr,
    };
  }
}

async function fetchCryptoRatesForDayRange(
  currency: string,
  days: number
): Promise<ProcessingResult> {
  const spinner = ora(`Fetching ${currency} prices for last ${days} days`).start();

  try {
    const { fromTimestamp, toTimestamp } = calculateDayRange(days);
    const cryptoRates = await fetchDailyCryptoRatesByRange(currency, fromTimestamp, toTimestamp);
    const { newEntriesCount, tsvPath } = updateTsvFileByDateRange(currency, cryptoRates);

    if (newEntriesCount > 0) {
      spinner.succeed(
        `Fetched ${currency} prices for last ${days} days (${newEntriesCount} new entries)`
      );
    } else {
      spinner.info(`No new data for ${currency} (last ${days} days)`);
    }

    return {
      currency,
      month: "N/A",
      newEntriesCount,
      status: newEntriesCount > 0 ? "success" : "skipped",
      tsvPath,
      year: "N/A",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.fail(`Failed to fetch ${currency} prices: ${errorMessage}`);
    return {
      currency,
      error: errorMessage,
      month: "N/A",
      newEntriesCount: 0,
      status: "error",
      tsvPath: "",
      year: "N/A",
    };
  }
}

function resolveCurrencies(currency: string): string[] {
  return currency === "all" ? Object.keys(coinConfigs) : [currency];
}

function parseRecentDays(recentDays?: string): number | null {
  if (!recentDays) {
    return null;
  }

  const days = Number.parseInt(recentDays, 10);
  if (Number.isNaN(days) || days < 1) {
    throw new Error("--recent-days must be a positive integer");
  }

  return days;
}

async function handleRecentDaysFetch(
  currencies: string[],
  currencyLabel: string,
  days: number
): Promise<void> {
  const currencyScope =
    currencies.length === 1 ? currencyLabel : `all ${currencies.length} currencies`;

  console.log(chalk.cyan(`🔍 Fetching prices for ${currencyScope} for last ${days} days`));
  console.log();

  const results: ProcessingResult[] = [];
  for (const curr of currencies) {
    const result = await fetchCryptoRatesForDayRange(curr, days);
    results.push(result);
  }

  displaySummaryTable(results);
}

function applyDefaultYearMonth(options: FetchCryptoRatesOptions): { month: string; year: string } {
  const defaults = getDefaultYearMonth();
  return {
    month: options.month || defaults.month,
    year: options.year || defaults.year,
  };
}

function buildMonthRange(startMonth: number, endMonth: number): number[] {
  const monthCount = endMonth - startMonth + 1;
  if (monthCount <= 0) {
    throw new Error("No valid months available for the requested year");
  }

  return Array.from({ length: monthCount }, (_, i) => startMonth + i);
}

function resolveMonths(yearNum: number, month: string): number[] {
  if (month !== "all") {
    return [toFloat(month)];
  }

  const earliest = getEarliestAllowedDate();
  const now = dayjs.utc();
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // dayjs month() returns 0-11

  const startMonth = yearNum === earliest.year ? earliest.month : 1;
  const maxMonth = yearNum === currentYear ? currentMonth : 12;

  if (maxMonth - startMonth + 1 <= 0) {
    throw new Error(
      `No valid months available for year ${yearNum}. ` +
        `Valid range is ${earliest.year}-${earliest.month.toString().padStart(2, "0")} to ${currentYear}-${currentMonth.toString().padStart(2, "0")}`
    );
  }

  return buildMonthRange(startMonth, maxMonth);
}

function logFetchScope(
  currency: string,
  month: string,
  currencies: string[],
  months: number[]
): void {
  if (currency === "all" && month === "all") {
    console.log(
      chalk.cyan(
        `🔍 Fetching prices for all ${currencies.length} currencies across ${months.length} months`
      )
    );
    console.log();
    return;
  }

  if (currency === "all") {
    console.log(chalk.cyan(`🔍 Fetching prices for all ${currencies.length} currencies`));
    console.log();
    return;
  }

  if (month === "all") {
    console.log(chalk.cyan(`🔍 Fetching ${currency} prices for ${months.length} months`));
    console.log();
  }
}

async function fetchMonthlyResults(
  currencies: string[],
  months: number[],
  yearNum: number
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  for (const curr of currencies) {
    for (const month of months) {
      const result = await fetchCryptoRatesForCurrency(curr, yearNum, month);
      results.push(result);
    }
  }

  return results;
}

async function fetchCryptoRatesAction(options: FetchCryptoRatesOptions): Promise<void> {
  const { currency } = options;

  // Validate currency
  validateCurrency(currency);

  // Determine which currencies to process
  const currencies = resolveCurrencies(currency);

  // Handle --recent-days flag (simplified day-based fetching)
  const recentDays = parseRecentDays(options.recentDays);
  if (recentDays !== null) {
    await handleRecentDaysFetch(currencies, currency, recentDays);
    return;
  }

  // Apply defaults for year and month
  const { month, year } = applyDefaultYearMonth(options);

  // Validate inputs
  validateDate(year, month);

  const yearNum = toFloat(year);

  // Determine which months to process
  const months = resolveMonths(yearNum, month);

  // Show initial log message
  logFetchScope(currency, month, currencies, months);

  // Process all currency/month combinations
  const results = await fetchMonthlyResults(currencies, months, yearNum);

  // Display summary table
  displaySummaryTable(results);
}

/* -------------------------------------------------------------------------- */
/*                                CLI COMMAND                                 */
/* -------------------------------------------------------------------------- */

function createFetchCryptoRatesCommand(): Command {
  const command = new Command();

  command
    .description("Fetch historical crypto prices from CoinGecko (up to 365 days in the past)")
    .requiredOption(
      "--currency <symbol>",
      "Currency symbol (e.g., ETH, CHZ) or 'all' for all currencies"
    )
    .option("--year <YYYY>", "Year in YYYY format (defaults to current year)")
    .option(
      "--month <MM>",
      "Month in MM format (01-12) or 'all' for all months (defaults to current month)"
    )
    .option(
      "--recent-days <N>",
      "Only fetch prices for the most recent N days (ideal for daily cron jobs)"
    )
    .action(async (options: FetchCryptoRatesOptions) => {
      await fetchCryptoRatesAction(options);
    });

  return command;
}

export const fetchCryptoRatesCmd = createFetchCryptoRatesCommand();

if (require.main === module) {
  fetchCryptoRatesCmd.parse(process.argv);
}
