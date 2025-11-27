#!/usr/bin/env node

import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import ora from "ora";
import { toFloat } from "radash";
import { coinConfigs } from "../config/coins";
import { fetchDailyCryptoRates } from "./fetch-crypto/coingecko-client";
import { updateTsvFile } from "./fetch-crypto/tsv-utils";

dayjs.extend(utc);

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type FetchCryptoRatesOptions = {
  currency: string;
  month?: string;
  year?: string;
  recent?: string;
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
      `Currency "${currency}" is not supported. Available currencies: ${supportedCurrencies}, all`,
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
        `Earliest allowed: ${earliest.year}-${earliest.month.toString().padStart(2, "0")}`,
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

function validateInputs(currency: string, year: string, month: string): void {
  validateCurrency(currency);
  validateDate(year, month);
}

/* -------------------------------------------------------------------------- */
/*                              MAIN FUNCTIONS                                */
/* -------------------------------------------------------------------------- */

function displaySummaryTable(results: ProcessingResult[]): void {
  if (results.length === 0) {
    return;
  }

  console.log();
  console.log(chalk.cyan.bold("=".repeat(80)));
  console.log(chalk.cyan.bold("📊 PROCESSING SUMMARY"));
  console.log(chalk.cyan.bold("=".repeat(80)));

  // Count results by status
  const successful = results.filter((r) => r.status === "success");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "error");

  console.log(
    `${chalk.green("✅ Success:")} ${successful.length} | ` +
      `${chalk.yellow("⏭️  Skipped:")} ${skipped.length} | ` +
      `${chalk.red("❌ Failed:")} ${failed.length}`,
  );

  // Display aggregated results table
  if (successful.length > 0 || skipped.length > 0) {
    console.log();

    // Aggregate results by currency
    const aggregatedResults = new Map<
      string,
      {
        currency: string;
        months: string[];
        totalNewEntries: number;
        hasSuccess: boolean;
        tsvPath: string;
      }
    >();

    for (const result of results) {
      if (result.status === "error") continue;

      const existing = aggregatedResults.get(result.currency);
      const yearMonth = `${result.year}-${result.month}`;

      if (existing) {
        existing.months.push(yearMonth);
        existing.totalNewEntries += result.newEntriesCount;
        existing.hasSuccess = existing.hasSuccess || result.status === "success";
      } else {
        aggregatedResults.set(result.currency, {
          currency: result.currency,
          hasSuccess: result.status === "success",
          months: [yearMonth],
          totalNewEntries: result.newEntriesCount,
          tsvPath: result.tsvPath,
        });
      }
    }

    const table = new Table({
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

    // Sort by currency name
    const sortedResults = Array.from(aggregatedResults.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency),
    );

    for (const result of sortedResults) {
      const statusColor = result.hasSuccess ? chalk.green : chalk.yellow;
      const statusText = result.hasSuccess ? "Updated" : "No changes";

      // Determine period display
      const sortedMonths = result.months.sort();
      const periodDisplay =
        sortedMonths.length === 1
          ? sortedMonths[0]
          : `${sortedMonths[0]} to ${sortedMonths[sortedMonths.length - 1]}`;

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

  // Display errors table
  if (failed.length > 0) {
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

  console.log();
}

async function fetchCryptoRatesForCurrency(
  currency: string,
  year: number,
  month: number,
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
        `Fetched ${currency} prices for ${yearStr}-${monthStr} (${newEntriesCount} new entries)`,
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

async function fetchCryptoRatesAction(options: FetchCryptoRatesOptions): Promise<void> {
  const { currency, recent } = options;

  // Apply defaults for year and month
  const defaults = getDefaultYearMonth();
  const month = options.month || defaults.month;
  const year = options.year || defaults.year;

  // Validate inputs
  validateInputs(currency, year, month);

  const yearNum = toFloat(year);

  // Determine which months to process
  const now = dayjs.utc();
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // dayjs month() returns 0-11

  let months: number[];
  let yearsToProcess: number[] = [yearNum];

  if (month === "all") {
    // If --recent is specified, only fetch the last N months
    if (recent) {
      const recentMonths = Number.parseInt(recent, 10);
      if (Number.isNaN(recentMonths) || recentMonths < 1) {
        throw new Error("--recent must be a positive integer");
      }

      // Calculate the recent months working backwards from current month
      const monthsToFetch: Array<{ month: number; year: number }> = [];
      let targetYear = currentYear;
      let targetMonth = currentMonth;

      for (let i = 0; i < recentMonths; i++) {
        monthsToFetch.push({ month: targetMonth, year: targetYear });
        targetMonth--;
        if (targetMonth < 1) {
          targetMonth = 12;
          targetYear--;
        }
      }

      // Group by year and sort
      const monthsByYear = new Map<number, number[]>();
      for (const { year: y, month: m } of monthsToFetch) {
        const existing = monthsByYear.get(y);
        if (existing) {
          existing.push(m);
        } else {
          monthsByYear.set(y, [m]);
        }
      }

      // Process each year's months
      yearsToProcess = Array.from(monthsByYear.keys()).sort((a, b) => a - b);
      const firstYearMonths = monthsByYear.get(yearsToProcess[0]);
      months = firstYearMonths ? firstYearMonths.sort((a, b) => a - b) : [];

      // If spanning multiple years, we'll handle this specially below
      if (yearsToProcess.length > 1) {
        // Flatten all year/month combinations for multi-year recent fetching
        const allMonthsToFetch = monthsToFetch.sort((a, b) =>
          a.year !== b.year ? a.year - b.year : a.month - b.month,
        );

        // Process all currency/month combinations
        const currencies = currency === "all" ? Object.keys(coinConfigs) : [currency];

        console.log(
          chalk.cyan(
            `🔍 Fetching prices for ${currencies.length === 1 ? currency : `all ${currencies.length} currencies`} for last ${recentMonths} months`,
          ),
        );
        console.log();

        const results: ProcessingResult[] = [];
        for (const curr of currencies) {
          for (const { year: y, month: m } of allMonthsToFetch) {
            const result = await fetchCryptoRatesForCurrency(curr, y, m);
            results.push(result);
          }
        }

        displaySummaryTable(results);
        return;
      }
    } else {
      const earliest = getEarliestAllowedDate();

      // Determine start month based on earliest allowed date
      const startMonth = yearNum === earliest.year ? earliest.month : 1;

      // Determine end month based on current date
      const maxMonth = yearNum === currentYear ? currentMonth : 12;

      // Calculate month range
      const monthCount = maxMonth - startMonth + 1;

      if (monthCount <= 0) {
        throw new Error(
          `No valid months available for year ${yearNum}. ` +
            `Valid range is ${earliest.year}-${earliest.month.toString().padStart(2, "0")} to ${currentYear}-${currentMonth.toString().padStart(2, "0")}`,
        );
      }

      months = Array.from({ length: monthCount }, (_, i) => startMonth + i);
    }
  } else {
    months = [toFloat(month)];
  }

  // Determine which currencies to process
  const currencies = currency === "all" ? Object.keys(coinConfigs) : [currency];

  // Show initial log message
  if (currency === "all" && month === "all") {
    console.log(
      chalk.cyan(
        `🔍 Fetching prices for all ${currencies.length} currencies across ${months.length} months`,
      ),
    );
    console.log();
  } else if (currency === "all") {
    console.log(chalk.cyan(`🔍 Fetching prices for all ${currencies.length} currencies`));
    console.log();
  } else if (month === "all") {
    console.log(chalk.cyan(`🔍 Fetching ${currency} prices for ${months.length} months`));
    console.log();
  }

  // Process all currency/month combinations
  const results: ProcessingResult[] = [];
  for (let i = 0; i < currencies.length; i++) {
    for (let j = 0; j < months.length; j++) {
      const result = await fetchCryptoRatesForCurrency(currencies[i], yearNum, months[j]);
      results.push(result);
    }
  }

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
      "Currency symbol (e.g., ETH, CHZ) or 'all' for all currencies",
    )
    .option("--year <YYYY>", "Year in YYYY format (defaults to current year)")
    .option(
      "--month <MM>",
      "Month in MM format (01-12) or 'all' for all months (defaults to current month)",
    )
    .option(
      "--recent <N>",
      "Only fetch the most recent N months (use with --month all to limit API calls)",
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
