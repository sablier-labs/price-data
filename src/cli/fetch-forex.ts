#!/usr/bin/env node

import * as path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import ora from "ora";
import { toFloat } from "radash";
import { fetchDailyForexRates } from "./fetch-forex/currencyfreaks-client";
import { getExistingDatesForMonth, getForexTsvPath, updateTsvFile } from "./fetch-forex/tsv-utils";

dayjs.extend(utc);

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type FetchForexRatesOptions = {
  month?: string;
  year?: string;
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

/* -------------------------------------------------------------------------- */
/*                              MAIN FUNCTIONS                                */
/* -------------------------------------------------------------------------- */

async function fetchForexRatesAction(options: FetchForexRatesOptions): Promise<void> {
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
    // Get existing dates for the target month
    const existingDates = getExistingDatesForMonth(yearNum, monthNum);

    // Fetch daily rates from CurrencyFreaks API
    const forexRates = await fetchDailyForexRates(yearNum, monthNum, existingDates);

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
    .option("--month <MM>", "Month in MM format (01-12) (defaults to current month)")
    .action(async (options: FetchForexRatesOptions) => {
      await fetchForexRatesAction(options);
    });

  return command;
}

export const fetchForexRatesCmd = createFetchForexRatesCommand();

if (require.main === module) {
  fetchForexRatesCmd.parse(process.argv);
}
