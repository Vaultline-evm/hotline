# Vaultline — Mobile Interface Design

## Product intent
Vaultline is a portrait-first, one-handed self-custody wallet. The private key is entered without asking for a public address; the app derives the address locally. The app must not transmit or log the private key. Before a hot-wallet transaction can be signed, the user must see the amount, recipient, network, fee components and total debit, then explicitly confirm.

## Screen list

| Screen | Primary content and functions |
|---|---|
| Wallet setup / unlock | Private-key-only entry, masked input, local derivation of the public address, clear local-storage and network warning, secure-store setup, and destructive removal/lock action. No public-address entry field. |
| Overview | Derived wallet address and copy action, selected network, total balance only when live data is available, asset list with ticker/icon/balance/value, and prominent Receive / Send actions. Unknown values are shown as unavailable rather than fabricated. |
| Send | Select supported network and asset, recipient address, amount, balance shortcut, estimated network and application fees, total debit, fee freshness/status and validation. “Review” is separate from “Send”. |
| Transaction review | Immutable pre-sign summary of chain, asset, destination, amount, network fee, any application fee, total debit, nonce/gas details where applicable, and warning that signing is hot. Explicit confirmation required. |
| Receive | Derived address, copy/share and QR representation, network label and mismatch warning. |
| Activity | Chronological transaction list, pending/confirmed/failed state, amount, asset, date, fee where known and transaction explorer link; empty and loading states. |
| Asset detail | Asset identity, network, balance/value if fetched, and related transaction activity. |
| Settings / security | Current address, local-only key storage status, lock/remove wallet, privacy explanation, network/RPC settings only if safely implemented. |

## Key user flows

1. First run → enter private key only → validate and derive address on-device → save using platform secure storage → show derived address and wallet overview.
2. Overview → Send → choose token/network → enter destination and amount → fetch/estimate current fees → review every charge and total → user confirms → sign locally → broadcast signed transaction → show returned transaction hash and activity status.
3. Overview → Receive → display address and QR → copy/share address.
4. Overview → Activity → open transaction detail → inspect status, values and explorer reference.
5. Settings → remove wallet → explicit destructive confirmation → delete local secure-store entry and return to setup.

## Visual system

Use a refined dark interface inspired by the source HTML: near-black navy `#0A0E16` background, elevated slate `#121824`, secondary surface `#18202E`, cool-white text `#E8EEFB`, muted slate `#98A4BC`, electric periwinkle `#7B93FF` as primary action, mint `#3DDBA5` for success, and warm coral `#FF8A70` for errors or outgoing values. Use generous card radii (16–20 pt), thin blue-gray borders, tabular numerals for balances, restrained gradients on the balance hero, and clear one-handed bottom actions. Use native safe areas and accessible touch targets. The initial interface language is Arabic with RTL layout; preserve protocol tickers and addresses left-to-right.

## Interaction and safety rules

The secret input must be masked by default and must never be copied into analytics, logs, crash reports, URLs, clipboard, app database, or network requests. Use OS-provided Keychain/Keystore-backed secure storage on device. On web preview, do not persist real private keys or allow real signing; communicate that browser storage is not equivalent to native secure storage. RPC endpoints receive only public blockchain requests, addresses and signed transaction payloads; a broadcast necessarily exposes a signed transaction to the selected network provider. Never present a fee estimate as guaranteed: show estimation time/source and block sending if estimates are unavailable or stale. Do not claim production-grade wallet security without independent review.

## Source parity

The exact supported chains, tokens, symbols, fee formula, and history behavior are to be transcribed from `Vaultline(26).html` before implementation. Do not invent assets or fee amounts. Preserve the original fee computation and transaction-history fields wherever they can be identified safely.
