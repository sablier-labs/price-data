# Sablier Price Data

This document contains instructions for AI agents working on the Sablier Price Data repository.

## Context

This repo provides centralized cryptocurrency and forex exchange rate data used across Sablier projects. The data is
stored in TSV format and sourced from [CoinGecko](https://coingecko.com/api) (crypto prices) and
[CurrencyFreaks](https://currencyfreaks.com/) (forex rates).

## Development

**WORKFLOW**: After code changes → `just full-check` → `just full-write` (if errors) → fix remaining issues manually

**COMMON COMMANDS**:

- `just tsc-check` - TypeScript type checking only
- `just tsv-check` - Validate TSV files against schema
- `ni <package>` - Install dependency (`ni -D` for dev dependency)
- `just fetch-crypto --currency <symbol>` - Fetch crypto prices from CoinGecko
- `just fetch-forex` - Fetch GBP/USD rates from CurrencyFreaks

## TSV Format

**REQUIREMENT**: All data files use tab-separated values (TSV) format.

- **Date format**: ISO 8601 (`YYYY-MM-DD`) wrapped in double quotes
- **Price format**: Decimal number (high precision), no quotes
- **Structure**: `id` (date) and `output` (price) columns
- **Validation**: Use `just tsv-check` to validate TSV files
