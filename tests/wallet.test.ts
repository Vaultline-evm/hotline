import { describe, expect, it } from "vitest";
import { NETWORKS, ALL_SOURCE_SYMBOLS, ASSET_META, balanceCheck, canSignReviewedTransaction, calculateFeeWei, deriveAddress, normalizePrivateKey, parseAmount, safeAddress, usdToAssetAmount, withSourceGasMargin } from "../lib/wallet";

describe("Vaultline local EVM wallet", () => {
  it("derives the public address locally from a private key and asks for no public-address input", () => {
    const key = "0000000000000000000000000000000000000000000000000000000000000001";
    expect(deriveAddress(key)).toBe("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
    expect(safeAddress(deriveAddress(key))).toBe(true);
    expect(normalizePrivateKey(key)).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it("rejects malformed and out-of-range private keys", () => {
    expect(() => normalizePrivateKey("not-a-key")).toThrow();
    expect(() => normalizePrivateKey("0x" + "0".repeat(64))).toThrow();
  });

  it("preserves all 13 source EVM networks and source asset display metadata", () => {
    expect(NETWORKS).toHaveLength(13);
    expect(NETWORKS.map((network) => network.chainId)).toEqual([1, 42161, 43114, 8453, 56, 81457, 42220, 59144, 204, 10, 11297108109, 137, 534352]);
    expect(ALL_SOURCE_SYMBOLS).toHaveLength(24);
    for (const symbol of ALL_SOURCE_SYMBOLS) expect(ASSET_META[symbol]).toBeDefined();
    for (const network of NETWORKS) for (const [symbol, token] of Object.entries(network.tokens)) {
      expect(token.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(token.decimals).toBeGreaterThanOrEqual(0);
      expect(token.decimals).toBeLessThanOrEqual(36);
      expect(symbol.length).toBeGreaterThan(0);
    }
  });

  it("matches source-verified ERC-20 contracts and decimals exactly", () => {
    const expected: Record<string, Record<string, [string, number]>> = {
      ethereum: { USDC: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 6], USDT: ["0xdac17f958d2ee523a2206206994597c13d831ec7", 6], BNB: ["0xb8c77482e45f1f44de1745f52c74426c631bdd52", 18], SOL: ["0xd31a59c85ae9d8edefec411d448f90841571b89c", 9], WBTC: ["0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", 8], LINK: ["0x514910771af9ca656af840dff83e8264ecf986ca", 18], USDE: ["0x4c9edd5852cd905f086c759e8383e09bff1e68b3", 18] },
      arbitrum: { USDC: ["0xaf88d065e77c8cc2239327c5edb3a432268e5831", 6], USDT: ["0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", 6] },
      avalanche: { USDC: ["0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", 6], USDT: ["0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", 6] },
      base: { USDC: ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 6], USDT: ["0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", 6] },
      bsc: { USDT: ["0x55d398326f99059ff775485246999027b3197955", 18], USDC: ["0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", 18], ETH: ["0x2170ed0880ac9a755fd29b2688956bd959f933f8", 18], ADA: ["0x3ee2200efb3400fabb9aac f31297cbdd1d435d47".replaceAll(" ", ""), 18], BCH: ["0x8ff795a6f4d97e7887c79bea79aba5cc76444adf", 18], DOGE: ["0xba2ae424d960c26247dd6c32edc70b295c744c43", 8], LINK: ["0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd", 18], LTC: ["0x4338665cbb7b2485a8855a139b75d5e34ab0db94", 18], SOL: ["0x570a5d26f7765ecb712c0924e4de545b89fd43df", 18], TRX: ["0x85eac5ac2f758618dfa09bdbe0cf174e7d574d5b", 18], WBTC: ["0x0555e30da8f98308edb960aa94c0db47230d2b9c", 8], XRP: ["0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe", 18], ZEC: ["0x1ba42e5193dfa8b03d15dd1b86a3113bbbef8eeb", 18] },
      celo: { USDC: ["0xceba9300f2b948710d2653dd7b07f33a8b32118c", 6], USDT: ["0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e", 6] },
      linea: { USDC: ["0x176211869ca2b568f2a7d4ee941e073a821ee1ff", 6] },
      opbnb: { USDT: ["0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3", 18], USDC: ["0x55d398326f99059ff775485246999027b3197955", 18] },
      optimism: { USDC: ["0x0b2c639c533813f4aa9d7837caf62653d097ff85", 6] },
      polygon: { USDC: ["0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", 6], USDT: ["0xc2132d05d31c914a87c6611c10748aeb04b58e8f", 6] },
    };
    for (const [networkId, tokens] of Object.entries(expected)) {
      const actual = NETWORKS.find((item) => item.id === networkId)!.tokens;
      for (const [symbol, [address, decimals]] of Object.entries(tokens)) {
        expect(actual[symbol].address.toLowerCase()).toBe(address);
        expect(actual[symbol].decimals).toBe(decimals);
      }
    }
  });

  it("uses the source 20 percent gas margin and native/token fallbacks", () => {
    expect(withSourceGasMargin(100_000n, true)).toBe(120_000n);
    expect(withSourceGasMargin(21_000n, false)).toBe(25_200n);
    expect(withSourceGasMargin(0n, true)).toBe(100_000n);
    expect(withSourceGasMargin(0n, false)).toBe(21_000n);
    expect(calculateFeeWei(21_000n, 10n)).toBe(210_000n);
  });

  it("validates available native balance for amount plus gas and token balance plus native gas", () => {
    expect(balanceCheck({ asset: "ETH", nativeAsset: "ETH", amountWei: 100n, feeWei: 10n, nativeBalanceWei: 110n, assetBalanceWei: 110n }).ok).toBe(true);
    expect(balanceCheck({ asset: "ETH", nativeAsset: "ETH", amountWei: 100n, feeWei: 11n, nativeBalanceWei: 110n, assetBalanceWei: 110n }).ok).toBe(false);
    expect(balanceCheck({ asset: "USDC", nativeAsset: "ETH", amountWei: 100n, feeWei: 10n, nativeBalanceWei: 10n, assetBalanceWei: 100n }).ok).toBe(true);
    expect(balanceCheck({ asset: "USDC", nativeAsset: "ETH", amountWei: 101n, feeWei: 10n, nativeBalanceWei: 10n, assetBalanceWei: 100n }).ok).toBe(false);
    expect(balanceCheck({ asset: "USDC", nativeAsset: "ETH", amountWei: 100n, feeWei: 11n, nativeBalanceWei: 10n, assetBalanceWei: 100n }).ok).toBe(false);
  });

  it("permits signing only while an explicit review is open and its fee estimate is fresh", () => {
    expect(canSignReviewedTransaction(true, 1_000_000, 1_090_000)).toBe(true);
    expect(canSignReviewedTransaction(false, 1_000_000, 1_001_000)).toBe(false);
    expect(canSignReviewedTransaction(true, 1_000_000, 1_090_001)).toBe(false);
    expect(canSignReviewedTransaction(true, 1_000_001, 1_000_000)).toBe(false);
    expect(canSignReviewedTransaction(true, Number.NaN, 1_000_000)).toBe(false);
  });

  it("converts USD display amounts to asset units with fixed-point arithmetic", () => {
    expect(usdToAssetAmount("100", 2000, 18)).toBe("0.05");
    expect(usdToAssetAmount("1.20", 0.5, 6)).toBe("2.4");
    expect(() => usdToAssetAmount("0", 1, 18)).toThrow();
    expect(() => usdToAssetAmount("1", 0, 18)).toThrow();
    expect(() => usdToAssetAmount("1.123456789", 1, 18)).toThrow();
  });

  it("parses decimal asset amounts without floating point scaling", () => {
    expect(parseAmount("1.234567", 6)).toBe(1_234_567n);
    expect(parseAmount("0.00000001", 8)).toBe(1n);
    expect(() => parseAmount("0", 18)).toThrow();
    expect(() => parseAmount("1e-8", 18)).toThrow();
    expect(() => parseAmount("1.0000001", 6)).toThrow();
  });
});
