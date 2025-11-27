#!/usr/bin/env node

import * as path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import ora from "ora";
import { toFloat } from "radash";
import { fetchDailyForexRates } from "./fetch-forex/currencyfreaks-client";
import { getForexTsvPath, updateTsvFile } from "./fetch-forex/tsv-utils";

dayjs.extend(utc);

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type FetchForexRatesOptions = {
  month?: string;
  year?: string;
};

type ProcessingResult = {
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

const MIN_YEAR = 2022;

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

function getAllMonthsSinceMinYear(): Array<{ year: number; month: number }> {
  const now = dayjs.utc();
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // dayjs month() returns 0-11

  const months: Array<{ year: number; month: number }> = [];

  for (let year = MIN_YEAR; year <= currentYear; year++) {
    const startMonth = 1;
    const endMonth = year === currentYear ? currentMonth : 12;

    for (let month = startMonth; month <= endMonth; month++) {
      months.push({ month, year });
    }
  }

  return months;
}

function getAllMonthsForYear(year: number): Array<{ year: number; month: number }> {
  const now = dayjs.utc();
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // dayjs month() returns 0-11

  const months: Array<{ year: number; month: number }> = [];

  // If it's the current year, only go up to current month
  const endMonth = year === currentYear ? currentMonth : 12;

  for (let month = 1; month <= endMonth; month++) {
    months.push({ month, year });
  }

  return months;
}

/* -------------------------------------------------------------------------- */
/*                                 VALIDATION                                 */
/* -------------------------------------------------------------------------- */

function validateDate(year: string, month: string): void {
  // Validate year format
  const yearNum = toFloat(year);
  if (Number.isNaN(yearNum) || year.length !== 4 || yearNum < MIN_YEAR) {
    throw new Error(`Year must be in YYYY format (starting from ${MIN_YEAR})`);
  }

  // Validate month format
  const monthNum = Number.parseInt(month, 10);
  if (Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new Error("Month must be between 01 and 12");
  }

  // Check if date is not in the future
  const now = dayjs.utc();
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // dayjs month() returns 0-11

  if (yearNum > currentYear || (yearNum === currentYear && monthNum > currentMonth)) {
    throw new Error("Cannot fetch forex rates for future dates");
  }
}

function validateYearForAll(year: string): number {
  // Validate year format
  const yearNum = toFloat(year);
  if (Number.isNaN(yearNum) || year.length !== 4 || yearNum < MIN_YEAR) {
    throw new Error(`Year must be in YYYY format (starting from ${MIN_YEAR})`);
  }

  // Check if year is not in the future
  const now = dayjs.utc();
  const currentYear = now.year();

  if (yearNum > currentYear) {
    throw new Error("Cannot fetch forex rates for future years");
  }

  return yearNum;
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

    const table = new Table({
      head: [
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

    // Sort by year-month
    const sortedResults = [...successful, ...skipped].sort((a, b) => {
      const aKey = `${a.year}-${a.month}`;
      const bKey = `${b.year}-${b.month}`;
      return aKey.localeCompare(bKey);
    });

    for (const result of sortedResults) {
      const statusColor = result.status === "success" ? chalk.green : chalk.yellow;
      const statusText = result.status === "success" ? "Updated" : "No changes";

      table.push([
        chalk.white(`${result.year}-${result.month}`),
        chalk.white(result.newEntriesCount.toString()),
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
      head: [chalk.red("Year-Month"), chalk.red("Error")],
      style: {
        border: ["red"],
        head: ["red"],
      },
    });

    for (const result of failed) {
      errorTable.push([
        chalk.white(`${result.year}-${result.month}`),
        chalk.gray(result.error || "Unknown error"),
      ]);
    }

    console.log(errorTable.toString());
  }

  console.log();
}

async function fetchForexRatesAction(options: FetchForexRatesOptions): Promise<void> {
  // Handle --month all: iterate over all months
  if (options.month === "all") {
    let allMonths: Array<{ year: number; month: number }>;

    if (options.year) {
      // Fetch all months for a specific year
      const yearNum = validateYearForAll(options.year);
      allMonths = getAllMonthsForYear(yearNum);
      console.log(
        chalk.cyan(
          `🔍 Fetching GBP/USD forex rates for all months in ${yearNum} (${allMonths.length} months)\n`,
        ),
      );
    } else {
      // Fetch all months from MIN_YEAR to current
      allMonths = getAllMonthsSinceMinYear();
      console.log(
        chalk.cyan(
          `🔍 Fetching GBP/USD forex rates for all months (${allMonths.length} months total)\n`,
        ),
      );
    }

    const results: ProcessingResult[] = [];

    for (const { year, month } of allMonths) {
      const yearStr = year.toString();
      const monthStr = month.toString().padStart(2, "0");

      const spinner = ora(`Fetching ${yearStr}-${monthStr}`).start();

      try {
        // Fetch daily rates from CurrencyFreaks API
        const forexRates = await fetchDailyForexRates(year, month);

        // Update TSV file with new data
        const { newEntriesCount, tsvPath } = updateTsvFile(forexRates);

        if (newEntriesCount > 0) {
          spinner.succeed(`Fetched ${yearStr}-${monthStr} (${newEntriesCount} new entries)`);
        } else {
          spinner.info(`No new data for ${yearStr}-${monthStr}`);
        }

        results.push({
          month: monthStr,
          newEntriesCount,
          status: newEntriesCount > 0 ? "success" : "skipped",
          tsvPath,
          year: yearStr,
        });

        // Add newline after each month for cleaner output
        console.log();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        spinner.fail(`Failed to fetch ${yearStr}-${monthStr}: ${errorMessage}`);

        results.push({
          error: errorMessage,
          month: monthStr,
          newEntriesCount: 0,
          status: "error",
          tsvPath: "",
          year: yearStr,
        });

        // Add newline after each month for cleaner output
        console.log();
      }
    }

    // Display summary table
    displaySummaryTable(results);
    return;
  }

  // Handle single month (original behavior)
  // Apply defaults for year and month
  const defaults = getDefaultYearMonth();
  const month = options.month || defaults.month;
  const year = options.year || defaults.year;

  // Validate inputs
  validateDate(year, month);

  const yearNum = toFloat(year);
  const monthNum = toFloat(month);

  const spinner = ora(`Fetching GBP/USD forex rates for ${year}-${month}`).start();

  try {
    // Fetch daily rates from CurrencyFreaks API
    const forexRates = await fetchDailyForexRates(yearNum, monthNum);

    if (forexRates.length === 0) {
      spinner.info(`No new data to add for ${year}-${month}`);
      console.log();
      const relativePath = path.relative(process.cwd(), getForexTsvPath());
      console.log(chalk.cyan(relativePath));
      return;
    }

    // Update TSV file with new data
    const { tsvPath } = updateTsvFile(forexRates);

    spinner.succeed(
      `Fetched GBP/USD forex rates for ${year}-${month} (${forexRates.length} new entries)`,
    );

    // Print the full clickable path on a new line with colorized output
    console.log();
    console.log(chalk.cyan(tsvPath));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.fail(`Failed to fetch forex rates for ${year}-${month}: ${errorMessage}`);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                                CLI COMMAND                                 */
/* -------------------------------------------------------------------------- */

function createFetchForexRatesCommand(): Command {
  const command = new Command();

  command
    .description("Fetch daily GBP/USD forex rates from CurrencyFreaks API")
    .option("--year <YYYY>", "Year in YYYY format (defaults to current year)")
    .option(
      "--month <MM>",
      'Month in MM format (01-12) or "all" to fetch all months. When "all" is used with --year, fetches all months in that year. Without --year, fetches all months from 2022 to present. Defaults to current month.',
    )
    .action(async (options: FetchForexRatesOptions) => {
      await fetchForexRatesAction(options);
    });

  return command;
}

export const fetchForexRatesCmd = createFetchForexRatesCommand();

if (require.main === module) {
  fetchForexRatesCmd.parse(process.argv);
}
