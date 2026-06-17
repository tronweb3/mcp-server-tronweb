import 'dotenv/config';

export const NETWORKS: Record<string, string> = {
  mainnet: 'https://api.trongrid.io',
  shasta: 'https://api.shasta.trongrid.io',
  nile: 'https://api.nileex.io',
};

const rawNetwork = process.env.TRON_NETWORK ?? 'mainnet';

export const config = {
  fullHost:
    process.env.TRON_FULL_HOST ??
    NETWORKS[rawNetwork] ??
    NETWORKS.mainnet,
  apiKey: process.env.TRON_API_KEY ?? '',
  defaultNetwork: rawNetwork,
} as const;
