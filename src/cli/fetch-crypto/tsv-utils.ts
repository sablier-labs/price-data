import * as fs from "node:fs";
import * as path from "node:path";

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

export type CryptoRateEntry = {
  date: string; // YYYY-MM-DD format
  price: number;
};

type TsvData = {
  entries: CryptoRateEntry[];
  existingDates: Set<string>;
};

/* -------------------------------------------------------------------------- */
/*                                FILE PATHS                                  */
/* -------------------------------------------------------------------------- */

function getCryptoTsvPath(currency: string): string {
  return path.join("crypto", `${currency}_USD.tsv`);
}

function ensureCryptoDirectoryExists(): void {
  const cryptoDir = path.join(process.cwd(), "crypto");
  if (!fs.existsSync(cryptoDir)) {
    fs.mkdirSync(cryptoDir, { recursive: true });
  }
}

/* -------------------------------------------------------------------------- */
/*                              READ OPERATIONS                               */
/* -------------------------------------------------------------------------- */

export function readExistingTsvData(currency: string): TsvData {
  const tsvPath = getCryptoTsvPath(currency);
  const entries: CryptoRateEntry[] = [];
  const existingDates = new Set<string>();

  if (!fs.existsSync(tsvPath)) {
    return { entries, existingDates };
  }

  const content = fs.readFileSync(tsvPath, "utf-8");
  const lines = content.trim().split("\n");

  // Skip header line and parse entries
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      const [dateQuoted, priceStr] = line.split("\t");
      const date = dateQuoted.replace(/"/g, ""); // Remove quotes
      const price = Number.parseFloat(priceStr);

      if (!Number.isNaN(price)) {
        entries.push({ date, price });
        existingDates.add(date);
      }
    }
  }

  return { entries, existingDates };
}

export function getExistingDatesForMonth(
  currency: string,
  year: number,
  month: number,
): Set<string> {
  const { existingDates } = readExistingTsvData(currency);
  const targetMonthPrefix = `${year}-${month.toString().padStart(2, "0")}`;

  // Filter to only dates in the target month
  const datesInMonth = new Set<string>();
  for (const date of existingDates) {
    if (date.startsWith(targetMonthPrefix)) {
      datesInMonth.add(date);
    }
  }

  return datesInMonth;
}

/* -------------------------------------------------------------------------- */
/*                              WRITE OPERATIONS                              */
/* -------------------------------------------------------------------------- */

function mergeEntries(
  existingEntries: CryptoRateEntry[],
  newEntries: CryptoRateEntry[],
  targetMonth: string,
): CryptoRateEntry[] {
  // Filter out dates that already exist in the target month
  const existingDatesInMonth = new Set(
    existingEntries
      .filter((entry) => entry.date.startsWith(targetMonth))
      .map((entry) => entry.date),
  );

  const filteredNewEntries = newEntries.filter((entry) => !existingDatesInMonth.has(entry.date));

  if (filteredNewEntries.length === 0) {
    return existingEntries;
  }

  // Combine existing and filtered new entries, then sort by date
  return [...existingEntries, ...filteredNewEntries].sort((a, b) => a.date.localeCompare(b.date));
}

function writeTsvFile(tsvPath: string, entries: CryptoRateEntry[]): void {
  const tsvContent = [
    "id\toutput",
    ...entries.map((entry) => `"${entry.date}"\t${entry.price}`),
  ].join("\n");
  fs.writeFileSync(tsvPath, tsvContent, "utf-8");
}

export function updateTsvFile(
  currency: string,
  newEntries: CryptoRateEntry[],
  year: number,
  month: number,
): {
  newEntriesCount: number;
  tsvPath: string;
} {
  ensureCryptoDirectoryExists();

  const tsvPath = getCryptoTsvPath(currency);
  const { entries: existingEntries } = readExistingTsvData(currency);

  if (newEntries.length === 0) {
    return { newEntriesCount: 0, tsvPath };
  }

  const targetMonthStr = `${year}-${month.toString().padStart(2, "0")}`;
  const mergedEntries = mergeEntries(existingEntries, newEntries, targetMonthStr);

  const newEntriesCount = mergedEntries.length - existingEntries.length;
  if (newEntriesCount === 0) {
    return { newEntriesCount: 0, tsvPath };
  }

  writeTsvFile(tsvPath, mergedEntries);

  return {
    newEntriesCount,
    tsvPath,
  };
}
