import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { coinConfigs } from "../../config/coins.js";

dayjs.extend(utc);

/* -------------------------------------------------------------------------- */
/*                                  CONSTANTS                                 */
/* -------------------------------------------------------------------------- */

const COINGECKO_BASE_URL = "https://pro-api.coingecko.com/api/v3";
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000; // 1 second base delay for exponential backoff
const MIN_RETRY_WAIT = 5000; // 5 seconds minimum wait on rate limit
const REQUEST_DELAY = 2000; // 2 seconds delay between requests to avoid rate limits

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type CoinGeckoRangeResponse = {
  prices: [number, number][]; // [timestamp, price]
};

export type CryptoRateEntry = {
  date: string; // YYYY-MM-DD format
  price: number;
};

/* -------------------------------------------------------------------------- */
/*                                   UTILITY                                  */
/* -------------------------------------------------------------------------- */

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns the CoinGecko API key from environment variables.
 * @throws Error if COINGECKO_API_KEY is not set
 */
function getApiKey(): string {
  const apiKey = process.env.COINGECKO_API_KEY;
  if (!apiKey) {
    throw new Error("COINGECKO_API_KEY environment variable is not set");
  }
  return apiKey;
}

/* -------------------------------------------------------------------------- */
/*                               DATE UTILITIES                               */
/* -------------------------------------------------------------------------- */

function calculateDateRange(
  year: number,
  month: number
): { fromTimestamp: number; toTimestamp: number } {
  const now = dayjs.utc();
  const currentYear = now.year();
  const currentMonth = now.month() + 1; // dayjs month() returns 0-11

  // Start of the month at 00:00 UTC
  const fromDate = dayjs
    .utc()
    .year(year)
    .month(month - 1)
    .startOf("month");
  const fromTimestamp = fromDate.unix();

  let toTimestamp: number;

  if (year === currentYear && month === currentMonth) {
    // Current month: use end of yesterday (23:59:59 UTC) to capture full day
    const yesterday = now.subtract(1, "day").endOf("day");
    toTimestamp = yesterday.unix();
  } else {
    // Past months: use first day of next month at 00:00 UTC
    const toDate = fromDate.add(1, "month");
    toTimestamp = toDate.unix();
  }

  return { fromTimestamp, toTimestamp };
}

export function calculateDayRange(days: number): { fromTimestamp: number; toTimestamp: number } {
  const now = dayjs.utc();

  // Start from N days ago at 00:00 UTC
  const fromDate = now.subtract(days, "day").startOf("day");
  const fromTimestamp = fromDate.unix();

  // End at yesterday 23:59:59 UTC (today's data isn't complete yet)
  const toDate = now.subtract(1, "day").endOf("day");
  const toTimestamp = toDate.unix();

  return { fromTimestamp, toTimestamp };
}

/* -------------------------------------------------------------------------- */
/*                                RETRY LOGIC                                 */
/* -------------------------------------------------------------------------- */

async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        // Handle rate limiting
        if (status === 429 && attempt < maxRetries) {
          const retryAfter = error.response?.headers["retry-after"];
          const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 0;
          const exponentialBackoff = delayMs * 2 ** attempt;
          // Use at least MIN_RETRY_WAIT to avoid instant retries when retry-after is 0
          const waitTime = Math.max(MIN_RETRY_WAIT, retryAfterMs || exponentialBackoff);

          console.warn(
            `⚠️  Rate limited by CoinGecko (429). Retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries + 1})`
          );

          await delay(waitTime);
          continue; // Retry the request
        }

        // Log error for non-429 errors or after max retries
        console.error(`Failed to fetch prices from CoinGecko: ${error.message}`, {
          attempt: attempt + 1,
          status,
        });
      }

      // If it's the last attempt or a non-retryable error, throw error
      if (attempt === maxRetries) {
        throw new Error(`Max retries (${maxRetries}) exceeded for operation`);
      }

      throw error;
    }
  }

  throw new Error("Unexpected error in withRetry");
}

/* -------------------------------------------------------------------------- */
/*                            RESPONSE PROCESSING                             */
/* -------------------------------------------------------------------------- */

function processCoinGeckoResponse(response: CoinGeckoRangeResponse): CryptoRateEntry[] {
  // Process the response to extract last price (close) for each date
  const pricesByDate = new Map<string, number>();

  for (const [timestamp, price] of response.prices) {
    const date = dayjs(timestamp).utc().format("YYYY-MM-DD");

    // Keep the last price for each date (close price)
    pricesByDate.set(date, price);
  }

  // Convert to array and sort by date
  return Array.from(pricesByDate.entries())
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* -------------------------------------------------------------------------- */
/*                               API FUNCTIONS                                */
/* -------------------------------------------------------------------------- */

async function fetchCoinGeckoPrices(
  currency: string,
  fromTimestamp: number,
  toTimestamp: number
): Promise<CryptoRateEntry[]> {
  const coinId = coinConfigs[currency].coinGeckoId;
  const url = new URL(`${COINGECKO_BASE_URL}/coins/${coinId}/market_chart/range`);
  url.searchParams.set("from", fromTimestamp.toString());
  url.searchParams.set("to", toTimestamp.toString());
  url.searchParams.set("vs_currency", "usd");

  const fetchOperation = async (): Promise<CryptoRateEntry[]> => {
    // Get a random API key for this attempt
    const apiKey = getApiKey();

    const response = await axios.get<CoinGeckoRangeResponse>(url.toString(), {
      headers: {
        "x-cg-pro-api-key": apiKey,
      },
    });

    return processCoinGeckoResponse(response.data);
  };

  const result = await withRetry(fetchOperation);

  // Add delay between requests to proactively avoid rate limits
  await delay(REQUEST_DELAY);

  return result;
}

/* -------------------------------------------------------------------------- */
/*                              MAIN FUNCTIONS                                */
/* -------------------------------------------------------------------------- */

export function fetchDailyCryptoRates(
  currency: string,
  year: number,
  month: number
): Promise<CryptoRateEntry[]> {
  // Calculate date range
  const { fromTimestamp, toTimestamp } = calculateDateRange(year, month);

  // Fetch prices from CoinGecko
  return fetchCoinGeckoPrices(currency, fromTimestamp, toTimestamp);
}

export function fetchDailyCryptoRatesByRange(
  currency: string,
  fromTimestamp: number,
  toTimestamp: number
): Promise<CryptoRateEntry[]> {
  return fetchCoinGeckoPrices(currency, fromTimestamp, toTimestamp);
}
