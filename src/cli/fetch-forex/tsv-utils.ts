import * as fs from "node:fs";
import * as path from "node:path";

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */

type ForexEntry = {
  date: string; // YYYY-MM-DD format
  rate: number;
};

type TsvData = {
  entries: ForexEntry[];
  existingDates: Set<string>;
};

/* -------------------------------------------------------------------------- */
/*                                FILE PATHS                                  */
/* -------------------------------------------------------------------------- */

export function getForexTsvPath(): string {
  return path.join(process.cwd(), "forex", "GBP_USD.tsv");
}

function ensureForexDirectoryExists(): void {
  const forexDir = path.join(process.cwd(), "forex");
  if (!fs.existsSync(forexDir)) {
    fs.mkdirSync(forexDir, { recursive: true });
  }
}

/* -------------------------------------------------------------------------- */
/*                              READ OPERATIONS                               */
/* -------------------------------------------------------------------------- */

export function readExistingTsvData(): TsvData {
  const tsvPath = getForexTsvPath();
  const entries: ForexEntry[] = [];
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
      const [dateQuoted, rateStr] = line.split("\t");
      const date = dateQuoted.replace(/"/g, ""); // Remove quotes
      const rate = Number.parseFloat(rateStr);

      if (!Number.isNaN(rate)) {
        entries.push({ date, rate });
        existingDates.add(date);
      }
    }
  }

  return { entries, existingDates };
}

export function getExistingDatesForMonth(year: number, month: number): Set<string> {
  const { existingDates } = readExistingTsvData();
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

function mergeEntries(existingEntries: ForexEntry[], newEntries: ForexEntry[]): ForexEntry[] {
  // Combine existing and new entries, then sort by date
  const allEntries = [...existingEntries, ...newEntries];

  // Sort by date ascending
  return allEntries.sort((a, b) => a.date.localeCompare(b.date));
}

function writeTsvFile(tsvPath: string, entries: ForexEntry[]): void {
  const tsvContent = [
    "id\toutput",
    ...entries.map((entry) => `"${entry.date}"\t${entry.rate}`),
  ].join("\n");
  fs.writeFileSync(tsvPath, tsvContent, "utf-8");
}

export function updateTsvFile(newEntries: ForexEntry[]): {
  newEntriesCount: number;
  tsvPath: string;
} {
  ensureForexDirectoryExists();

  const tsvPath = getForexTsvPath();
  const relativePath = path.relative(process.cwd(), tsvPath);
  const { entries: existingEntries } = readExistingTsvData();

  if (newEntries.length === 0) {
    return { newEntriesCount: 0, tsvPath: relativePath };
  }

  const mergedEntries = mergeEntries(existingEntries, newEntries);
  writeTsvFile(tsvPath, mergedEntries);

  return {
    newEntriesCount: newEntries.length,
    tsvPath: relativePath,
  };
}
