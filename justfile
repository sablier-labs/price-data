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
[group("scripts")]
@fetch-crypto currency year=YEAR month=MONTH *args:
    na tsx src/cli/fetch-crypto.ts \
        --currency {{ currency }} \
        --year {{ year }} \
        --month {{ month }} \
        {{ args }}

# Fetch daily GBP/USD forex rates from CurrencyFreaks
[group("scripts")]
@fetch-forex year=YEAR month=MONTH *args:
    na tsx src/cli/fetch-forex.ts \
        --year {{ year }} \
        --month {{ month }} \
        {{ args }}

# Check TSV files
[group("lint")]
[script]
tsv-check:
    echo "Validating TSV files..."
    has_error=0
    for file in data/transactions/*/*.tsv; do
        # Skip validation artifact files
        case "$file" in
            *.tsv.invalid|*.tsv.valid|*validation-errors.tsv)
                continue
                ;;
        esac

        # Skip if no files match the pattern
        [ -e "$file" ] || continue

        if ! qsv validate "$file" &>/dev/null; then
            echo "❌ $file is invalid"
            echo "See $file.validation-errors.tsv for details"
            has_error=1
        fi
    done
    if [ $has_error -eq 1 ]; then
        exit 1
    fi
    echo "✅ All TSV files are valid"
