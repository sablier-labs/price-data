import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { coinConfigs } from "../../config/coins";

dayjs.extend(utc);

/* -------------------------------------------------------------------------- */
/*                                  CONSTANTS                                 */
/* -------------------------------------------------------------------------- */

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000; // 1 second

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type CoinGeckoRangeResponse = {
  prices: Array<[number, number]>; // [timestamp, price]
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
 * Randomly selects and returns one of two CoinGecko API keys from environment variables.
 * @throws Error if either COINGECKO_API_KEY_1 or COINGECKO_API_KEY_2 is not set
 * @returns A randomly selected API key
 */
function getApiKey(): string {
  const apiKey1 = process.env.COINGECKO_API_KEY_1;
  const apiKey2 = process.env.COINGECKO_API_KEY_2;

  if (!apiKey1) {
    throw new Error("COINGECKO_API_KEY_1 environment variable is not set");
  }

  if (!apiKey2) {
    throw new Error("COINGECKO_API_KEY_2 environment variable is not set");
  }

  // Randomly select one of the two keys
  return Math.random() < 0.5 ? apiKey1 : apiKey2;
}

/* -------------------------------------------------------------------------- */
/*                               DATE UTILITIES                               */
/* -------------------------------------------------------------------------- */

function calculateDateRange(
  year: number,
  month: number,
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

/* -------------------------------------------------------------------------- */
/*                                RETRY LOGIC                                 */
/* -------------------------------------------------------------------------- */

async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY,
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
          const waitTime = retryAfter ? Number(retryAfter) * 1000 : delayMs * 2 ** attempt;

          console.warn(
            `⚠️  Rate limited by CoinGecko (429). Retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries + 1})`,
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
  toTimestamp: number,
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
        "x-cg-demo-api-key": apiKey,
      },
    });

    return processCoinGeckoResponse(response.data);
  };

  return withRetry(fetchOperation);
}

/* -------------------------------------------------------------------------- */
/*                              MAIN FUNCTIONS                                */
/* -------------------------------------------------------------------------- */

export async function fetchDailyCryptoRates(
  currency: string,
  year: number,
  month: number,
): Promise<CryptoRateEntry[]> {
  // Calculate date range
  const { fromTimestamp, toTimestamp } = calculateDateRange(year, month);

  // Fetch prices from CoinGecko
  return fetchCoinGeckoPrices(currency, fromTimestamp, toTimestamp);
}
