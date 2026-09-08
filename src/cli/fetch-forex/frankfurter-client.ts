import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { getExistingDatesForMonth } from "./tsv-utils.js";

dayjs.extend(utc);

type ForexRateEntry = {
  date: string;
  rate: number;
};

type FrankfurterResponse = {
  base?: unknown;
  date?: unknown;
  quote?: unknown;
  rate?: unknown;
};

const LOOKBACK_DAYS = 7;

/** Fetch GBP→USD from ECB, accepting only the target date or its preceding seven days. */
export async function fetchRateForDate(date: string): Promise<number> {
  const allowedDates = Array.from({ length: LOOKBACK_DAYS + 1 }, (_, offset) =>
    dayjs.utc(date).subtract(offset, "day").format("YYYY-MM-DD")
  );

  for (const candidate of allowedDates) {
    const url = new URL("https://api.frankfurter.dev/v2/rate/GBP/USD");
    url.searchParams.set("date", candidate);
    url.searchParams.set("providers", "ECB");
    let data: FrankfurterResponse;
    try {
      const response = await axios.get<FrankfurterResponse>(url.toString(), { timeout: 10_000 });
      data = response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        continue;
      }
      throw error;
    }

    if (
      !data ||
      data.base !== "GBP" ||
      data.quote !== "USD" ||
      typeof data.date !== "string" ||
      !allowedDates.includes(data.date) ||
      typeof data.rate !== "number" ||
      !Number.isFinite(data.rate) ||
      data.rate <= 0
    ) {
      throw new Error(`Invalid Frankfurter response for GBP/USD on ${candidate}`);
    }
    if (data.date !== date) {
      console.warn(`Using ECB GBP/USD rate from ${data.date} for ${date}`);
    }
    return data.rate;
  }
  throw new Error(
    `No GBP/USD exchange rate found for ${date} or the previous ${LOOKBACK_DAYS} days`
  );
}

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

/** Preserve saved observations and fetch only missing calendar dates. */
export async function fetchDailyForexRates(year: number, month: number): Promise<ForexRateEntry[]> {
  const existingDates = getExistingDatesForMonth(year, month);
  const dates = getDatesInMonth(year, month).filter((date) => !existingDates.has(date));
  const rates: ForexRateEntry[] = [];
  for (const date of dates) {
    rates.push({ date, rate: await fetchRateForDate(date) });
  }
  return rates;
}
