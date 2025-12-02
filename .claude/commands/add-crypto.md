---
argument-hint: "<SYMBOL> <coingecko-id> [--from YYYY-MM-DD]"
description: Add a new cryptocurrency with price data from CoinGecko
model: sonnet
---

## Context

- Existing currencies: !`ls crypto/*.tsv | xargs -I {} basename {} _USD.tsv | sort`
- Coin config: !`cat src/config/coins.ts`
- Arguments: $ARGUMENTS

## Task

### STEP 1: Parse arguments

Extract from $ARGUMENTS:

- `SYMBOL` (required): Uppercase currency symbol (e.g., `MON`, `LINK`)
- `coingecko-id` (required): CoinGecko API identifier (e.g., `monad`, `chainlink`)
- `--from YYYY-MM-DD` (optional): Start date for price data (defaults to first of current month)

IF missing SYMBOL or coingecko-id:

- ERROR: "Usage: /add-crypto SYMBOL coingecko-id [--from YYYY-MM-DD]"
- HINT: "Find the CoinGecko ID at https://coingecko.com/en/coins/{coin-name} - it's in the URL"

### STEP 2: Validate inputs

**Check symbol format:**

- Must be uppercase letters only
- IF invalid: ERROR "Symbol must be uppercase letters (e.g., MON, LINK)"

**Check symbol doesn't exist:**

- Check if `crypto/{SYMBOL}_USD.tsv` already exists
- Check if symbol is in `src/config/coins.ts`
- IF exists: ERROR "Currency {SYMBOL} already exists"

**Validate CoinGecko ID (optional):**

- CoinGecko IDs are typically lowercase with hyphens
- Common pattern: `{coin-name}` or `{descriptive-name}`

### STEP 3: Add coin configuration

Edit `src/config/coins.ts` to add the new coin entry.

**Find insertion point:**

- Entries are sorted alphabetically by symbol
- Find the correct position to maintain alphabetical order
- Insert after the appropriate entry

**Add entry:**

```typescript
{SYMBOL}: {
  coinGeckoId: "{coingecko-id}",
},
```

### STEP 4: Create TSV file

Create `crypto/{SYMBOL}_USD.tsv` with header only:

```
id	output
```

Note: Use actual tab character between columns.

### STEP 5: Fetch initial price data

Determine fetch parameters:

- IF `--from` specified: Parse the date to get year and month
- ELSE: Use current month

Run the fetch command:

```bash
just fetch-crypto {SYMBOL} {year} {month}
```

IF `--from` spans multiple months to today:

- Fetch each month sequentially
- OR use `just fetch-crypto {SYMBOL} {year} all` if fetching full year

### STEP 6: Verify and summarize

**Check the TSV file:**

- Verify `crypto/{SYMBOL}_USD.tsv` has data rows
- Count the number of price entries

**Display summary:**

```
Added {SYMBOL} ({coingecko-id})

Files modified:
- src/config/coins.ts (added coin config)
- crypto/{SYMBOL}_USD.tsv (created with {N} price entries)

Date range: {first-date} to {last-date}
```

IF fetch failed:

- WARN: "Price fetch failed. The coin config was added but no price data was fetched."
- HINT: "Verify the CoinGecko ID is correct: https://coingecko.com/en/coins/{coingecko-id}"
- HINT: "Try manually: just fetch-crypto {SYMBOL}"

## Examples

**Basic usage (current month):**

```
/add-crypto LINK chainlink
```

**With start date:**

```
/add-crypto MON monad --from 2025-11-24
```

**Common CoinGecko IDs:**

- ETH → `ethereum`
- BTC → `bitcoin`
- LINK → `chainlink`
- UNI → `uniswap`
- AAVE → `aave`
- COMP → `compound-governance-token`

## Notes

- CoinGecko limits historical data to 365 days in the past
- TSV format: ISO 8601 dates in quotes, decimal prices without quotes
- Run `just tsv-check` after to validate the new file
