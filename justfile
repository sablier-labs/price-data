# See https://github.com/sablier-labs/devkit/blob/main/just/base.just
import "./node_modules/@sablier/devkit/just/base.just"
import "./node_modules/@sablier/devkit/just/npm.just"
import "./node_modules/@sablier/devkit/just/tsv.just"

set dotenv-load

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

# Current year
YEAR := ```
    node -e "console.log(new Date().getFullYear())"
```

# ---------------------------------------------------------------------------- #
#                                    SCRIPTS                                   #
# ---------------------------------------------------------------------------- #

# Fetch cryptocurrency prices from CoinGecko
@fetch-crypto currency year=YEAR month="all" *args:
    na tsx src/cli/fetch-crypto.ts \
        --currency {{ currency }} \
        --year {{ year }} \
        --month {{ month }} \
        {{ args }}

# Fetch daily GBP/USD forex rates from CurrencyFreaks
@fetch-forex year=YEAR month="all" *args:
    na tsx src/cli/fetch-forex.ts \
        --year {{ year }} \
        --month {{ month }} \
        {{ args }}

# Check TSV files
[group("checks")]
[script]
tsv-check:
    just _tsv-check "{crypto,forex}/*.tsv"
