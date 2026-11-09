import { Interface, Wallet, formatUnits, getAddress, isAddress, parseUnits } from "ethers";

export type NetworkConfig = {
  id: string;
  name: string;
  short: string;
  chainId: number;
  native: string;
  rpc: string | null;
  explorer: string;
  nativePrice: string;
  tokens: Record<string, { address: string; decimals: number }>;
};

const noTokens: NetworkConfig["tokens"] = {};

export const NETWORKS: NetworkConfig[] = [
  { id: "ethereum", name: "Ethereum Mainnet", short: "Ethereum", chainId: 1, native: "ETH", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io/tx/", nativePrice: "ethereum", tokens: { USDC: { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 }, USDT: { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 }, BNB: { address: "0xb8c77482e45f1f44de1745f52c74426c631bdd52", decimals: 18 }, SOL: { address: "0xd31a59c85ae9d8edefec411d448f90841571b89c", decimals: 9 }, WBTC: { address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", decimals: 8 }, LINK: { address: "0x514910771af9ca656af840dff83e8264ecf986ca", decimals: 18 }, USDE: { address: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", decimals: 18 } } },
  { id: "arbitrum", name: "Arbitrum One", short: "Arbitrum", chainId: 42161, native: "ETH", rpc: "https://arbitrum-one-rpc.publicnode.com", explorer: "https://arbiscan.io/tx/", nativePrice: "ethereum", tokens: { USDC: { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6 }, USDT: { address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6 } } },
  { id: "avalanche", name: "Avalanche (C-Chain)", short: "Avalanche", chainId: 43114, native: "AVAX", rpc: "https://avalanche-c-chain-rpc.publicnode.com", explorer: "https://snowtrace.io/tx/", nativePrice: "avalanche-2", tokens: { USDC: { address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", decimals: 6 }, USDT: { address: "0x9702230a8ea53601f5cd2dc00fdb c13d4df4a8c7".replaceAll(" ", ""), decimals: 6 } } },
  { id: "base", name: "Base", short: "Base", chainId: 8453, native: "ETH", rpc: "https://base-rpc.publicnode.com", explorer: "https://basescan.org/tx/", nativePrice: "ethereum", tokens: { USDC: { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 }, USDT: { address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", decimals: 6 } } },
  { id: "bsc", name: "Binance Smart Chain (BSC)", short: "BSC", chainId: 56, native: "BNB", rpc: "https://bsc-rpc.publicnode.com", explorer: "https://bscscan.com/tx/", nativePrice: "binancecoin", tokens: { USDT: { address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 }, USDC: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 }, ETH: { address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", decimals: 18 }, ADA: { address: "0x3ee2200efb3400fabb9aac f31297cbdd1d435d47".replaceAll(" ", ""), decimals: 18 }, BCH: { address: "0x8ff795a6f4d97e7887c79bea79aba5cc76444adf", decimals: 18 }, DOGE: { address: "0xba2ae424d960c26247dd6c32edc70b295c744c43", decimals: 8 }, LINK: { address: "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd", decimals: 18 }, LTC: { address: "0x4338665cbb7b2485a8855a139b75d5e34ab0db94", decimals: 18 }, SOL: { address: "0x570a5d26f7765ecb712c0924e4de545b89fd43df", decimals: 18 }, TRX: { address: "0x85eac5ac2f758618dfa09bdbe0cf174e7d574d5b", decimals: 18 }, WBTC: { address: "0x0555e30da8f98308edb960aa94c0db47230d2b9c", decimals: 8 }, XRP: { address: "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe", decimals: 18 }, ZEC: { address: "0x1ba42e5193dfa8b03d15dd1b86a3113bbbef8eeb", decimals: 18 } } },
  { id: "blast", name: "Blast", short: "Blast", chainId: 81457, native: "ETH", rpc: "https://rpc.blast.io", explorer: "https://blastscan.io/tx/", nativePrice: "ethereum", tokens: noTokens },
  { id: "celo", name: "Celo", short: "Celo", chainId: 42220, native: "CELO", rpc: "https://celo.publicnode.com", explorer: "https://celoscan.io/tx/", nativePrice: "celo", tokens: { USDC: { address: "0xceba9300f2b948710d2653dd7b07f33a8b32118c", decimals: 6 }, USDT: { address: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e", decimals: 6 } } },
  { id: "linea", name: "Linea", short: "Linea", chainId: 59144, native: "ETH", rpc: "https://linea-rpc.publicnode.com", explorer: "https://lineascan.build/tx/", nativePrice: "ethereum", tokens: { USDC: { address: "0x176211869ca2b568f2a7d4ee941e073a821ee1ff", decimals: 6 } } },
  { id: "opbnb", name: "opBNB", short: "opBNB", chainId: 204, native: "BNB", rpc: "https://opbnb-rpc.publicnode.com", explorer: "https://opbnbscan.com/tx/", nativePrice: "binancecoin", tokens: { USDT: { address: "0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3", decimals: 18 }, USDC: { address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 } } },
  { id: "optimism", name: "Optimism", short: "Optimism", chainId: 10, native: "ETH", rpc: "https://optimism-rpc.publicnode.com", explorer: "https://optimistic.etherscan.io/tx/", nativePrice: "ethereum", tokens: { USDC: { address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", decimals: 6 } } },
  { id: "palm", name: "Palm", short: "Palm", chainId: 11297108109, native: "PALM", rpc: null, explorer: "https://palm.chainlens.com/", nativePrice: "ethereum", tokens: noTokens },
  { id: "polygon", name: "Polygon PoS", short: "Polygon", chainId: 137, native: "POL", rpc: "https://polygon-bor-rpc.publicnode.com", explorer: "https://polygonscan.com/tx/", nativePrice: "matic-network", tokens: { USDC: { address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6 }, USDT: { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6 } } },
  { id: "scroll", name: "Scroll", short: "Scroll", chainId: 534352, native: "ETH", rpc: "https://scroll-rpc.publicnode.com", explorer: "https://scrollscan.com/tx/", nativePrice: "ethereum", tokens: noTokens },
];

export const ASSET_META: Record<string, { label: string; color: string; priceId?: string }> = {
  ETH: { label: "Ether", color: "#627EEA", priceId: "ethereum" }, AVAX: { label: "Avalanche", color: "#E84142", priceId: "avalanche-2" }, BNB: { label: "BNB", color: "#F3BA2F", priceId: "binancecoin" }, CELO: { label: "Celo", color: "#35D07F", priceId: "celo" }, USDT: { label: "Tether USD", color: "#26A17B", priceId: "tether" }, USDC: { label: "USD Coin", color: "#2775CA", priceId: "usd-coin" }, BTC: { label: "Bitcoin", color: "#F7931A", priceId: "bitcoin" }, XRP: { label: "XRP", color: "#23292F", priceId: "ripple" }, SOL: { label: "Solana", color: "#9945FF", priceId: "solana" }, TRX: { label: "TRON", color: "#EF0027", priceId: "tron" }, HYPE: { label: "Hyperliquid", color: "#6C5CE7", priceId: "hyperliquid" }, DOGE: { label: "Dogecoin", color: "#C2A633", priceId: "dogecoin" }, ZEC: { label: "Zcash", color: "#F4B728", priceId: "zcash" }, WBTC: { label: "Wrapped Bitcoin", color: "#F09242", priceId: "wrapped-bitcoin" }, LINK: { label: "Chainlink Token", color: "#375BD2", priceId: "chainlink" }, ADA: { label: "Cardano", color: "#0033AD", priceId: "cardano" }, XLM: { label: "Stellar", color: "#111111", priceId: "stellar" }, BCH: { label: "Bitcoin Cash", color: "#8DC351", priceId: "bitcoin-cash" }, USDE: { label: "Ethena USDe", color: "#A8A8B7", priceId: "ethena-usde" }, TON: { label: "Toncoin", color: "#0098EA", priceId: "the-open-network" }, LTC: { label: "Litecoin", color: "#345D9D", priceId: "litecoin" }, HBAR: { label: "HBAR", color: "#222222", priceId: "hedera-hashgraph" }, POL: { label: "Polygon", color: "#8247E5", priceId: "matic-network" }, PALM: { label: "Palm", color: "#00D395", priceId: "ethereum" },
};

export const ALL_SOURCE_SYMBOLS = ["ETH", "AVAX", "BNB", "CELO", "USDT", "USDC", "BTC", "XRP", "SOL", "TRX", "HYPE", "DOGE", "ZEC", "WBTC", "LINK", "ADA", "XLM", "BCH", "USDE", "TON", "LTC", "HBAR", "POL", "PALM"];
export const TOKEN_IFACE = new Interface(["function balanceOf(address owner) view returns (uint256)", "function transfer(address to,uint256 amount)"]);

export function normalizePrivateKey(input: string): string {
  const raw = input.trim();
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("أدخل مفتاح EVM خاصًا صحيحًا بطول 64 خانة سداسية عشرية.");
  // Wallet constructor validates secp256k1 scalar range. This operation is local only.
  return new Wallet(key).privateKey;
}

export function deriveAddress(privateKey: string): string {
  return getAddress(new Wallet(normalizePrivateKey(privateKey)).address);
}

export function safeAddress(input: string): boolean {
  try { return isAddress(input.trim()); } catch { return false; }
}

export function decimalsFor(network: NetworkConfig, asset: string): number {
  return network.tokens[asset]?.decimals ?? 18;
}

export function parseAmount(amount: string, decimals: number): bigint {
  const text = amount.trim();
  if (!/^\d+(\.\d*)?$/.test(text) || Number(text) <= 0) throw new Error("أدخل مبلغًا أكبر من صفر وبصيغة صحيحة.");
  return parseUnits(text, decimals);
}

export function usdToAssetAmount(usdInput: string, priceUsd: number, decimals: number): string {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new Error("سعر التحويل غير متاح الآن؛ أدخل الكمية بوحدة الأصل.");
  let usdWei: bigint;
  let priceWei: bigint;
  try {
    usdWei = parseUnits(usdInput.trim(), 8);
    priceWei = parseUnits(priceUsd.toFixed(12), 12);
  } catch { throw new Error("أدخل مبلغ USD بحد أقصى 8 منازل عشرية."); }
  if (usdWei <= 0n || priceWei <= 0n) throw new Error("أدخل مبلغًا أكبر من صفر وتأكد من توفر سعر الأصل.");
  const assetWei = (usdWei * (10n ** BigInt(decimals + 4))) / priceWei;
  if (assetWei <= 0n) throw new Error("المبلغ أقل من أصغر وحدة قابلة للإرسال لهذا الأصل.");
  return formatUnits(assetWei, decimals);
}

export function canSignReviewedTransaction(reviewOpen: boolean, createdAt: number, now: number): boolean {
  return reviewOpen && Number.isFinite(createdAt) && now >= createdAt && now - createdAt <= 90_000;
}

export function calculateFeeWei(gasLimit: bigint, maxFeePerGas: bigint): bigint {
  if (gasLimit <= 0n || maxFeePerGas <= 0n) throw new Error("بيانات الرسوم غير صالحة.");
  return gasLimit * maxFeePerGas;
}

export function withSourceGasMargin(estimatedGas: bigint, isToken: boolean): bigint {
  const fallback = isToken ? 100_000n : 21_000n;
  if (estimatedGas <= 0n) return fallback;
  return (estimatedGas * 120n) / 100n;
}

export function balanceCheck(args: { asset: string; nativeAsset: string; amountWei: bigint; feeWei: bigint; nativeBalanceWei: bigint; assetBalanceWei: bigint }): { ok: boolean; reason?: string } {
  if (args.asset === args.nativeAsset) {
    if (args.nativeBalanceWei < args.amountWei + args.feeWei) return { ok: false, reason: "الرصيد الأصلي لا يكفي للمبلغ ورسوم الشبكة معًا." };
  } else {
    if (args.assetBalanceWei < args.amountWei) return { ok: false, reason: `رصيد ${args.asset} غير كافٍ.` };
    if (args.nativeBalanceWei < args.feeWei) return { ok: false, reason: `يلزم رصيد ${args.nativeAsset} منفصل لتغطية رسوم الشبكة.` };
  }
  return { ok: true };
}

export function formatUnitsSafe(value: bigint | string, decimals = 18, places = 6): string {
  const [whole, fractional = ""] = formatUnits(BigInt(value), decimals).split(".");
  const trimmed = fractional.slice(0, places).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function createTokenTransfer(to: string, amountWei: bigint): string {
  return TOKEN_IFACE.encodeFunctionData("transfer", [getAddress(to), amountWei]);
}

export function tokenBalanceCall(owner: string): string {
  return TOKEN_IFACE.encodeFunctionData("balanceOf", [getAddress(owner)]);
}
