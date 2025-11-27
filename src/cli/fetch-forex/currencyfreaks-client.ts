import axios from "axios";
import axiosRetry from "axios-retry";
import chalk from "chalk";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

/* -------------------------------------------------------------------------- */
/*                                  CONSTANTS                                 */
/* -------------------------------------------------------------------------- */

const CURRENCY_FREAKS_BASE_URL = "https://api.currencyfreaks.com/v2.0";
const MAX_RETRIES = 3;
const REQUEST_DELAY = 500; // 500ms between requests to respect rate limits
const RETRY_DELAY_BASE = 1000; // 1 second base delay for exponential backoff

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type CurrencyFreaksResponse = {
  base: string;
  date: string;
  rates: {
    [currency: string]: string;
  };
};

type ForexRateEntry = {
  date: string; // YYYY-MM-DD format
  rate: number;
};

/* -------------------------------------------------------------------------- */
/*                                   UTILITY                                  */
/* -------------------------------------------------------------------------- */

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/*                                AXIOS SETUP                                 */
/* -------------------------------------------------------------------------- */

const axiosInstance = axios.create();

// Configure axios-retry with exponential backoff
axiosRetry(axiosInstance, {
  onRetry: (retryCount, error) => {
    const delayMs = RETRY_DELAY_BASE * 2 ** (retryCount - 1);
    console.warn(
      chalk.yellow(
        `⚠️  Retry attempt ${retryCount}/${MAX_RETRIES} after ${delayMs}ms. Error: ${error.message}`,
      ),
    );
  },
  retries: MAX_RETRIES,
  retryCondition: (error) => {
    // Retry on network errors or 5xx server errors or 429 rate limit
    return (
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (axios.isAxiosError(error) &&
        (error.response?.status === 429 || (error.response?.status ?? 0) >= 500))
    );
  },
  retryDelay: (retryCount) => RETRY_DELAY_BASE * 2 ** (retryCount - 1),
});

/* -------------------------------------------------------------------------- */
/*                               API FUNCTIONS                                */
/* -------------------------------------------------------------------------- */

function getCurrencyFreaksApiKey(): string {
  const apiKey = process.env.CURRENCY_FREAKS_API_KEY;
  if (!apiKey) {
    throw new Error("CURRENCY_FREAKS_API_KEY environment variable is required");
  }
  return apiKey;
}

async function fetchRateForDate(apiKey: string, date: string): Promise<number | null> {
  const url = new URL(`${CURRENCY_FREAKS_BASE_URL}/rates/historical`);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("date", date);

  try {
    const response = await axiosInstance.get<CurrencyFreaksResponse>(url.toString());

    // Check if we have GBP rate in the response
    if (!response.data.rates?.GBP) {
      console.warn(chalk.yellow(`⚠️  No GBP rate found for ${date}`));
      return null;
    }

    const usdToGbpRate = Number(response.data.rates.GBP);

    if (Number.isNaN(usdToGbpRate) || usdToGbpRate <= 0) {
      console.warn(chalk.yellow(`⚠️  Invalid GBP rate ${response.data.rates.GBP} for ${date}`));
      return null;
    }

    // Convert USD→GBP rate to GBP→USD rate (inverse)
    const gbpToUsdRate = 1 / usdToGbpRate;

    // Truncate to 4 decimal places
    const truncatedRate = Math.round(gbpToUsdRate * 10000) / 10000;

    return truncatedRate;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      if (status === 429) {
        console.error(chalk.red(`❌ Rate limited by CurrencyFreaks API for ${date}`));
      } else {
        console.error(chalk.red(`❌ Failed to fetch rate for ${date}: ${error.message}`));
      }
    } else {
      console.error(chalk.red(`❌ Unexpected error for ${date}: ${String(error)}`));
    }
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                              DATE UTILITIES                                */
/* -------------------------------------------------------------------------- */

function getDatesInMonth(year: number, month: number): string[] {
  const now = dayjs.utc();
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // dayjs month() returns 0-11

  const startDate = dayjs
    .utc()
    .year(year)
    .month(month - 1)
    .startOf("month");

  let endDate: dayjs.Dayjs;

  if (year === currentYear && month === currentMonth) {
    // Current month: fetch up to yesterday
    endDate = now.subtract(1, "day").endOf("day");
  } else {
    // Past months: fetch all days in month
    endDate = startDate.endOf("month");
  }

  const dates: string[] = [];
  let currentDate = startDate;

  while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, "day")) {
    dates.push(currentDate.format("YYYY-MM-DD"));
    currentDate = currentDate.add(1, "day");
  }

  return dates;
}

/* -------------------------------------------------------------------------- */
/*                              MAIN FUNCTIONS                                */
/* -------------------------------------------------------------------------- */

export async function fetchDailyForexRates(year: number, month: number): Promise<ForexRateEntry[]> {
  const apiKey = getCurrencyFreaksApiKey();
  const allDatesInMonth = getDatesInMonth(year, month);

  // Fetch all dates in the month (no filtering of existing dates)
  // This allows us to compare and override existing data when API values differ
  const datesToFetch = allDatesInMonth;

  if (datesToFetch.length === 0) {
    return [];
  }

  const rates: ForexRateEntry[] = [];

  for (let i = 0; i < datesToFetch.length; i++) {
    const date = datesToFetch[i];
    const rate = await fetchRateForDate(apiKey, date);

    if (rate !== null) {
      rates.push({ date, rate });
    }

    // Add delay between requests to respect rate limits
    if (i < datesToFetch.length - 1) {
      await delay(REQUEST_DELAY);
    }
  }

  return rates;
}
