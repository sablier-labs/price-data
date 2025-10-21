import { chains } from "sablier";

export type CoinConfig = {
  coinGeckoId: string;
};

export const coinConfigs: Record<string, CoinConfig> = {
  AAVE: {
    coinGeckoId: "aave",
  },
  [chains.avalanche.nativeCurrency.symbol]: {
    coinGeckoId: chains.avalanche.nativeCurrency.coinGeckoId,
  },
  [chains.berachain.nativeCurrency.symbol]: {
    coinGeckoId: chains.berachain.nativeCurrency.coinGeckoId,
  },
  [chains.bsc.nativeCurrency.symbol]: {
    coinGeckoId: chains.bsc.nativeCurrency.coinGeckoId,
  },
  [chains.chiliz.nativeCurrency.symbol]: {
    coinGeckoId: chains.chiliz.nativeCurrency.coinGeckoId,
  },
  COMP: {
    coinGeckoId: "compound-governance-token",
  },
  GRT: {
    coinGeckoId: "the-graph",
  },
  [chains.hyperevm.nativeCurrency.symbol]: {
    coinGeckoId: chains.hyperevm.nativeCurrency.coinGeckoId,
  },
  [chains.mainnet.nativeCurrency.symbol]: {
    coinGeckoId: chains.mainnet.nativeCurrency.coinGeckoId,
  },
  OP: {
    coinGeckoId: "optimism",
  },
  [chains.polygon.nativeCurrency.symbol]: {
    coinGeckoId: chains.polygon.nativeCurrency.coinGeckoId,
  },
  SAFE: {
    coinGeckoId: "safe",
  },
  SCR: {
    coinGeckoId: "scroll",
  },
  [chains.sei.nativeCurrency.symbol]: {
    coinGeckoId: "sei-network",
  },
  [chains.sonic.nativeCurrency.symbol]: {
    coinGeckoId: chains.sonic.nativeCurrency.coinGeckoId,
  },
  [chains.sophon.nativeCurrency.symbol]: {
    coinGeckoId: chains.sophon.nativeCurrency.coinGeckoId,
  },
  SOL: {
    coinGeckoId: "solana",
  },
  stETH: {
    coinGeckoId: "staked-ether",
  },
  USDC: {
    coinGeckoId: "usd-coin",
  },
  USDT: {
    coinGeckoId: "tether",
  },
  [chains.xdc.nativeCurrency.symbol]: {
    coinGeckoId: chains.xdc.nativeCurrency.coinGeckoId,
  },
};
