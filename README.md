# Sablier Price Data

Centralized repository for cryptocurrency and forex exchange rate data used across Sablier projects.

## Overview

This repository serves as a single source of truth for price data shared between multiple Sablier repositories:

- **Indexers** ([sablier-labs/indexers](https://github.com/sablier-labs/indexers)) - Real-time blockchain data indexing
- **Accounting** ([sablier-labs/business](https://github.com/sablier-labs/business)) - Financial reporting and
  accounting

By centralizing the data here, we avoid duplication and ensure consistency across projects.

## Data Sources

All price data is sourced from industry-standard APIs:

- **Cryptocurrency Prices**: [CoinGecko API](https://www.coingecko.com/api) - Daily historical prices in USD
- **Forex Exchange Rates**: [CurrencyFreaks API](https://currencyfreaks.com/) - Daily GBP/USD exchange rates

## Data Structure

Price data is organized in `data/crypto/` (cryptocurrency prices in USD) and `data/forex/` (foreign exchange rates).

### TSV Format

All files use tab-separated values (TSV) format with the following structure:

```tsv
id	output
"2025-02-01"	3296.390634843652
"2025-02-02"	3125.0386801320924
```

We use this data structure to make it easier to use the files in our
[Envio indexers](https://github.com/sablier-labs/indexers).

**Columns:**

- `id`: Date in ISO 8601 format (`YYYY-MM-DD`), wrapped in double quotes
- `output`: USD price as a decimal number (high precision)

**Notes:**

- Dates are in UTC timezone
- Dates are sorted chronologically
- No duplicate dates within a file
- Prices are daily closing prices (00:00 UTC)

## Installation

Install the package via npm:

```bash
npm install @sablier/price-data
```

Or using Bun:

```bash
bun add @sablier/price-data
```

## Usage

### Package Import

Once installed, you can access the TSV data files from `node_modules/@sablier/price-data/data/`:

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read ETH prices
const dataPath = join(process.cwd(), "node_modules", "@sablier/price-data", "data/crypto/ETH_USD.tsv");
const ethPrices = readFileSync(dataPath, "utf-8");

// Parse TSV (skip header)
const lines = ethPrices.split("\n").slice(1);
const prices = lines.map((line) => {
  const [dateQuoted, price] = line.split("\t");
  return {
    date: dateQuoted.replace(/"/g, ""), // Remove quotes
    price: parseFloat(price),
  };
});
```

### Direct File Access

Alternatively, you can read the TSV files directly from this repository without installing the package.

**Example: curl:**

```bash
curl -s https://raw.githubusercontent.com/sablier-labs/price-data/main/data/crypto/ETH_USD.tsv | head -n 10
```

**Example (fetch with Node.js):**

```typescript
const response = await fetch("https://raw.githubusercontent.com/sablier-labs/price-data/main/data/crypto/ETH_USD.tsv");
const ethPrices = await response.text();

// Parse TSV (skip header)
const lines = ethPrices.split("\n").slice(1);
const prices = lines.map((line) => {
  const [dateQuoted, price] = line.split("\t");
  return {
    date: dateQuoted.replace(/"/g, ""), // Remove quotes
    price: parseFloat(price),
  };
});
```

### Git Submodule

For projects that need version-locked data, add this repository as a Git submodule:

```bash
git submodule add https://github.com/sablier-labs/price-data.git
```

## Updating Data

TODO
