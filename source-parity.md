# Source parity inventory

The source is the user-provided `Vaultline(26).html`. This is an EVM, watch-only wallet. This inventory separates exact supported on-chain assets from the broader price/display metadata; do not mistake that metadata list for sendable tokens.

## Networks and sendable assets

| Network | Chain ID | Native asset | Source-configured tokens |
|---|---:|---|---|
| Ethereum Mainnet | 1 | ETH | USDC, USDT, BNB, SOL, WBTC, LINK, USDE |
| Arbitrum One | 42161 | ETH | USDC, USDT |
| Avalanche (C-Chain) | 43114 | AVAX | USDC, USDT |
| Base | 8453 | ETH | USDC, USDT |
| Binance Smart Chain (BSC) | 56 | BNB | USDT, USDC, ETH, ADA, BCH, DOGE, LINK, LTC, SOL, TRX, WBTC, XRP, ZEC |
| Blast | 81457 | ETH | none |
| Celo | 42220 | CELO | USDC, USDT |
| Linea | 59144 | ETH | USDC |
| opBNB | 204 | BNB | USDT, USDC |
| Optimism | 10 | ETH | USDC |
| Palm | 11297108109 | PALM | none |
| Polygon PoS | 137 | POL | USDC, USDT |
| Scroll | 534352 | ETH | none |

The original also carries price/name/icon metadata for ETH, AVAX, BNB, CELO, USDT, USDC, BTC, XRP, SOL, TRX, HYPE, DOGE, ZEC, WBTC, LINK, ADA, XLM, BCH, USDE, TON, LTC, HBAR, POL and PALM. Price metadata is not evidence of a sendable asset on a network. Preserve the full metadata list and only enable sending of native assets and contracts configured by the source. Contract addresses and decimal precision must be carried from the source arrays verbatim and reviewed before live transactions.

## Fee and send rules

The original obtains provider fee data, uses a 21,000 gas fallback for native transfers and a 100,000 gas fallback for token transfers, prefers `maxFeePerGas` (otherwise `gasPrice`), and estimates an initial network fee as `gasPrice × fallback gasLimit`. Before transaction creation, it requests `estimateGas` and applies a 20% gas-limit margin (`estimated × 120 / 100`), then computes the final fee from the selected price field and this adjusted gas limit. A native send requires native balance for `amount + fee`; a token send requires sufficient native balance to cover the network fee. “Max” for native transfers reserves 1.15× the current estimate. The transaction is an EVM transfer or ERC-20 `transfer(address,uint256)` calldata with pending nonce and chain ID. There is no application commission in the source logic; the amount/fee panels show network fee only. Preserve this behavior rather than inventing a platform commission.

## Prices

The source uses CoinGecko simple-price IDs for supported symbols, and treats USDT, USDC and USDE as one USD for display. These are indicative display conversions only. If current price data is unavailable, show it as unavailable, never as zero-value assertions or security-critical send calculations.

## Activity

The source scans native transactions (`txlist`) and token transfers (`tokentx`) across the configured networks using per-chain explorer endpoints (Routescan for Avalanche, Blockscout for Base, Etherscan v2 fallback/primary for most others). BSC activity is linked to BscScan rather than loaded by the source. Entries preserve hash, network ID/name, asset/token, token contract, amount, from/to, direction, block, timestamp, status, indicative price/USD value, explorer URL, and token log index. Entries are deduplicated by network + hash + token contract/asset + log index/type and sorted newest first. Filters are all/incoming/outgoing.

## Security changes required for the native app

The source starts in watch-only mode and has no private key or hot signing. The Expo app must replace public-address setup with private-key-only setup, derive the EVM address locally, store only the key in iOS Keychain / Android Keystore via SecureStore, and never write the key to AsyncStorage, app database, logs, analytics, URLs, QR, or RPC request fields. Hot signing occurs on the device after an explicit transaction review. Only the resulting signed transaction is broadcast. Real secrets embedded in the HTML source (provider/explorer keys) are deliberately excluded from the app and must not be reused; use non-secret public RPC endpoints for this prototype or user-owned providers configured later.

## RPC verification notes (November 2026)

PublicNode’s first-party registry lists Ethereum, BNB Smart Chain, Polygon, Base, Arbitrum, Optimism, Avalanche, opBNB, Linea, Celo and Scroll and exposes RPC endpoint links. The Ethereum page labels `https://ethereum-rpc.publicnode.com` as an RPC endpoint. Tested `eth_chainId` calls in this sandbox returned matching chain IDs for Ethereum, Arbitrum, Avalanche, Base, BSC, Celo, Linea, opBNB, Optimism, Polygon and Scroll. The initial Blast publicnode hostname returned an error; Blast’s own docs specify `https://rpc.blast.io`, chain ID 81457 and ETH. Palm’s ChainList page showed no RPC server addresses; the Tatum URL tried in a no-credential JSON-RPC check returned HTTP 404. Therefore Palm remains visible, but its endpoint needs replacement / user-configured RPC before it can be considered functional; do not reuse any provider credential from the HTML.

Sources: [PublicNode endpoints](https://www.publicnode.com/), [Ethereum PublicNode endpoint](https://ethereum.publicnode.com/), [Blast network info](https://metalayerlabs.mintlify.app/building/network-information), [ChainList Palm network](https://chainlist.org/chain/11297108109), [Palm RPC node list](https://rpcnodelist.com/palm-mainnet).


Additional Blast check (2026-11-08): Blast official docs list `https://rpc.blast.io` as Mainnet RPC (chain ID 81457) and alternative endpoints `https://blast.din.dev/rpc` and `https://blastl2-mainnet.public.blastapi.io`. From this sandbox, DNS for the official URL and DIN URL did not resolve; BlastAPI returned HTTP 403 and explicitly stated the endpoint is retired; `blast.publicnode.com` showed a not-found page. The app retains the official URL but its connectivity is unverified in this environment. No API key is embedded. Palm has no working keyless RPC in this implementation, so it remains visible but cannot refresh/send.
