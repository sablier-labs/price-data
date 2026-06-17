---
argument-hint: "<SYMBOL> <coingecko-id> [--from YYYY-MM-DD]"
disable-model-invocation: false
name: add-crypto
user-invocable: true
description: Add a new cryptocurrency with price data from CoinGecko to the Sablier price-data repo. Creates the coin config entry in src/config/coins.ts, creates crypto/<SYMBOL>_USD.tsv, and fetches historical USD prices via just fetch-crypto. Use when onboarding or adding a new crypto token, coin, or currency to this repo. Trigger phrases include add crypto, add coin, add currency, new token, onboard a coin.
---

# Add Crypto

Onboard a new cryptocurrency: register its coin config, create its TSV file, and backfill historical USD prices from CoinGecko.

## Arguments

- `SYMBOL` (required): uppercase currency symbol (e.g., `MON`, `LINK`).
- `coingecko-id` (required): CoinGecko API identifier (e.g., `monad`, `chainlink`). Find it in the coin's CoinGecko URL: `https://coingecko.com/en/coins/{coin-name}`.
- `--from YYYY-MM-DD` (optional): start date for price data. Defaults to the first of the current month.

If `SYMBOL` or `coingecko-id` is missing, stop and report:
`Usage: add-crypto SYMBOL coingecko-id [--from YYYY-MM-DD]`

## Workflow

### Step 0: Gather context

Run these to understand the current state before editing:

- Existing currencies: `ls crypto/*.tsv | xargs -I {} basename {} _USD.tsv | sort`
- Current coin config: read `src/config/coins.ts`
- Available chains (for native currencies): `node -e "const {chains}=require('sablier'); console.log(Object.keys(chains).sort().join(', '))"`

### Step 1: Validate inputs

- **Symbol format**: must be uppercase letters only. Else error `Symbol must be uppercase letters (e.g., MON, LINK)`.
- **Symbol not already present**: fail with `Currency {SYMBOL} already exists` if either:
  - `crypto/{SYMBOL}_USD.tsv` exists, or
  - `{SYMBOL}` is already in `src/config/coins.ts`.
- **CoinGecko ID sanity**: IDs are typically lowercase with hyphens (`{coin-name}`). Warn (don't block) if it looks off.

### Step 2: Add coin configuration

Edit `src/config/coins.ts`. Entries are sorted alphabetically by symbol — insert at the correct position.

If the token is a chain's native currency in the `sablier` package (e.g., MON for Monad, S for Sonic) and `chains.{chainName}.nativeCurrency` exists with a matching symbol and `coinGeckoId`, use the dynamic pattern:

```typescript
[chains.{chainName}.nativeCurrency.symbol]: {
  coinGeckoId: chains.{chainName}.nativeCurrency.coinGeckoId,
},
```

Otherwise (tokens like AAVE, COMP, USDC that aren't chain-native), use a literal entry:

```typescript
{SYMBOL}: {
  coinGeckoId: "{coingecko-id}",
},
```

### Step 3: Create the TSV file

Create `crypto/{SYMBOL}_USD.tsv` with a header row only — an actual tab character between the columns:

```
id	output
```

### Step 4: Fetch initial price data

Determine fetch parameters:

- If `--from` is set, parse it into `{year}` and `{month}`. Else use the current month.

Run:

```bash
just fetch-crypto --currency {SYMBOL} --year {year} --month {month}
```

If `--from` spans multiple months up to today, fetch each month sequentially, or use `--month all` to fetch the full year.

### Step 5: Verify and summarize

Confirm `crypto/{SYMBOL}_USD.tsv` has data rows and count the price entries, then report:

```
Added {SYMBOL} ({coingecko-id})

Files modified:
- src/config/coins.ts (added coin config)
- crypto/{SYMBOL}_USD.tsv (created with {N} price entries)

Date range: {first-date} to {last-date}
```

If the fetch failed:

- Warn: `Price fetch failed. The coin config was added but no price data was fetched.`
- Hint: verify the CoinGecko ID at `https://coingecko.com/en/coins/{coingecko-id}`.
- Hint: retry manually with `just fetch-crypto --currency {SYMBOL}`.

Finally, run `just tsv-check` to validate the new file.

## Examples

Basic usage (current month):

```
add-crypto LINK chainlink
```

With a start date:

```
add-crypto MON monad --from 2025-11-24
```

Common CoinGecko IDs: ETH → `ethereum`, BTC → `bitcoin`, LINK → `chainlink`, UNI → `uniswap`, AAVE → `aave`, COMP → `compound-governance-token`.

## Notes

- CoinGecko limits historical data to 365 days in the past.
- TSV format: ISO 8601 dates in double quotes, decimal prices without quotes.
