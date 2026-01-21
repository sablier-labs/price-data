# See https://github.com/sablier-labs/devkit/blob/main/just/base.just
import "./node_modules/@sablier/devkit/just/base.just"
import "./node_modules/@sablier/devkit/just/npm.just"
import "./node_modules/@sablier/devkit/just/csv.just"

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
[arg("currency", long)]
[arg("year", long)]
[arg("month", long)]
@fetch-crypto currency year=YEAR month="all":
    na tsx src/cli/fetch-crypto.ts \
        --currency {{ currency }} \
        --year {{ year }} \
        --month {{ month }}

# Fetch cryptocurrency prices for recent days (for cron jobs)
[arg("currency", long)]
[arg("days", long)]
@fetch-crypto-recent currency="all" days="3":
    na tsx src/cli/fetch-crypto.ts \
        --currency {{ currency }} \
        --recent-days {{ days }}

# Fetch daily GBP/USD forex rates from CurrencyFreaks
[arg("year", long)]
[arg("month", long)]
@fetch-forex year=YEAR month="all" *args:
    na tsx src/cli/fetch-forex.ts \
        --year {{ year }} \
        --month {{ month }} \
        {{ args }}

# Check TSV files
[group("checks")]
tsv-check:
    just _csv-check --glob "{crypto,forex}/*.tsv"
