# Sablier Price Data

This document contains instructions for AI agents working on the Sablier Price Data repository.

## Context

This repo provides centralized cryptocurrency and forex exchange rate data used across Sablier projects. The data is
stored in TSV format and sourced from [CoinGecko](https://coingecko.com/api) (crypto prices) and
[Frankfurter](https://frankfurter.dev/) with `providers=ECB` (forex rates; no API key required).

## Development

**WORKFLOW**: After code changes → `just full-check` → `just full-write` (if errors) → fix remaining issues manually

**COMMON COMMANDS**:

- `just tsc-check` - TypeScript type checking only
- `just tsv-check` - Validate TSV files against schema
- `ni <package>` - Install dependency (`ni -D` for dev dependency)
- `just fetch-crypto --currency <symbol>` - Fetch crypto prices from CoinGecko
- `just fetch-forex` - Append missing GBP/USD rates from Frankfurter (ECB)

## TSV Format

**REQUIREMENT**: All data files use tab-separated values (TSV) format.

- **Date format**: ISO 8601 (`YYYY-MM-DD`) wrapped in double quotes
- **Price format**: Decimal number (high precision), no quotes
- **Structure**: `id` (date) and `output` (price) columns
- **Validation**: Use `just tsv-check` to validate TSV files

## Forex provider policy

`fetch-forex` preserves existing observations and fills missing dates only. CurrencyFreaks observations through
2026-08-25 remain unchanged; new observations use ECB via Frankfurter v2. GBP is the base, USD is the quote.
Weekend/holiday dates use the nearest earlier ECB observation, at most seven days before the requested date. Never use a
future observation, change provider implicitly, or turn an API failure into a successful partial month. Only HTTP 404
triggers backward lookup; other errors fail the command. Current-month runs stop at yesterday in UTC.

Run provider tests with `node --import tsx --test src/cli/fetch-forex/frankfurter-client.test.ts`.
