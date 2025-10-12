# See https://github.com/sablier-labs/devkit/blob/main/just/base.just
import "./node_modules/@sablier/devkit/just/base.just"
import "./node_modules/@sablier/devkit/just/npm.just"

set dotenv-load := true

# ---------------------------------------------------------------------------- #
#                                 DEPENDENCIES                                 #
# ---------------------------------------------------------------------------- #

# Ni: https://github.com/antfu-collective/ni
na := require("na")
ni := require("ni")
nlx := require("nlx")

# qsv: https://github.com/dathere/qsv
qsv := require("qsv")

# ---------------------------------------------------------------------------- #
#                                   CONSTANTS                                  #
# ---------------------------------------------------------------------------- #

# Current month
MONTH := ```
    node -e "console.log(String(new Date().getMonth() + 1).padStart(2, '0'))"
```

# Current year
YEAR := ```
    node -e "console.log(new Date().getFullYear())"
```

# ---------------------------------------------------------------------------- #
#                                    SCRIPTS                                   #
# ---------------------------------------------------------------------------- #

# Fetch cryptocurrency prices from CoinGecko
@fetch-crypto currency year=YEAR month=MONTH *args:
    na tsx src/cli/fetch-crypto.ts \
        --currency {{ currency }} \
        --year {{ year }} \
        --month {{ month }} \
        {{ args }}

# Fetch daily GBP/USD forex rates from CurrencyFreaks
@fetch-forex year=YEAR month=MONTH *args:
    na tsx src/cli/fetch-forex.ts \
        --year {{ year }} \
        --month {{ month }} \
        {{ args }}

# Check TSV files
[group("checks")]
[script]
tsv-check:
    echo "Validating TSV files..."
    for file in data/transactions/*/*.tsv; do
        # Skip validation artifact files
        case "$file" in
            *.tsv.invalid|*.tsv.valid|*validation-errors.tsv)
                continue
                ;;
        esac

        # Skip if no files match the pattern
        [ -e "$file" ] || continue

        if ! qsv validate "$file" data/transactions/schema.json > /dev/null 2>&1; then
            echo "❌ Validation failed for: $file"
            echo "See $file.validation-errors.tsv for details"
            exit 1
        fi
    done
    echo "✅ All TSV files are valid"
