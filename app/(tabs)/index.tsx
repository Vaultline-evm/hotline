import "react-native-get-random-values";
import "@ethersproject/shims";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ASSET_META, ALL_SOURCE_SYMBOLS, NETWORKS, balanceCheck, canSignReviewedTransaction, createTokenTransfer, deriveAddress, normalizePrivateKey, parseAmount, safeAddress, usdToAssetAmount, withSourceGasMargin, type NetworkConfig } from "@/lib/wallet";
import { secureWallet, type HistoryRecord, type WalletMeta } from "@/lib/secure-wallet";
import { Contract, JsonRpcProvider, Wallet, formatEther, formatUnits } from "ethers";
import QRCode from "react-native-qrcode-svg";

const C = { bg: "#0A0E16", surface: "#121824", surface2: "#18202E", ink: "#E8EEFB", muted: "#98A4BC", quiet: "#6B7891", line: "#253048", lineStrong: "#33415E", blue: "#7B93FF", blueDeep: "#5A74FF", blue2: "#1A2340", sage: "#3DDBA5", sage2: "#12352A", copper: "#FF8A70", copper2: "#3A211C", warning: "#F2D79A" };
type Page = "home" | "activity" | "send" | "receive" | "settings";
type BalanceMap = Record<string, Record<string, string>>;
type FeeReview = { networkId: string; asset: string; amount: string; recipient: string; feeWei: string; gasLimit: string; gasPrice: string; usedFallback: boolean; maxFeePerGas?: string; maxPriorityFeePerGas?: string; nonce: number; txTo: string; txValue: string; data: string; feeNative: string; feeUsd: number | null; amountUsd: number | null; totalUsd: number | null; createdAt: number };
type AssetRow = { key: string; networkId: string; networkName: string; symbol: string; amount: string; price: number | null };

const TOKEN_ABI = ["function balanceOf(address owner) view returns (uint256)"];
const PRICE_IDS = [...new Set(ALL_SOURCE_SYMBOLS.map((s) => ASSET_META[s]?.priceId).filter(Boolean))] as string[];
const TAB_LABELS: Record<Page, string> = { home: "الرئيسية", activity: "السجل", send: "إرسال", receive: "استلام", settings: "الأمان" };
const shortAddress = (s: string, n = 6) => `${s.slice(0, n)}…${s.slice(-4)}`;
const money = (n: number | null | undefined, d = 2) => n == null || !Number.isFinite(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const qty = (n: string | number, d = 6) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "—";
};
const providerFor = (network: NetworkConfig) => {
  if (!network.rpc) throw new Error(`لا تتوفر نقطة RPC عامة موثقة لشبكة ${network.name} حاليًا.`);
  return new JsonRpcProvider(network.rpc, network.chainId, { staticNetwork: true });
};

async function mapLimit<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await work(items[cursor++]);
  }));
}

export default function HomeScreen() {
  const [wallet, setWallet] = useState<WalletMeta | null>(null);
  const [wallets, setWallets] = useState<WalletMeta[]>([]);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState<Page>("home");
  const [keyInput, setKeyInput] = useState("");
  const [networkId, setNetworkId] = useState(NETWORKS[0].id);
  const [asset, setAsset] = useState("ETH");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"asset" | "usd">("asset");
  const [balances, setBalances] = useState<BalanceMap>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "in" | "out">("all");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [feeReview, setFeeReview] = useState<FeeReview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walletAddressRef = useRef<string | null>(null);

  const network = useMemo(() => NETWORKS.find((n) => n.id === networkId) ?? NETWORKS[0], [networkId]);
  const currentPrice = useMemo(() => {
    const id = ASSET_META[asset]?.priceId;
    if (id && prices[id] != null) return prices[id];
    if (["USDT", "USDC", "USDE"].includes(asset)) return 1;
    return prices[ASSET_META[asset]?.priceId || network.nativePrice] ?? null;
  }, [asset, network, prices]);
  const tokenConfig = network.tokens[asset];
  const decimals = tokenConfig?.decimals ?? 18;

  const showNotice = useCallback((text: string, error = false) => {
    setNotice(text); setNoticeError(error);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5200);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [savedWallets, activeId] = await Promise.all([secureWallet.loadWallets(), secureWallet.loadActiveWalletId()]);
        if (!active) return;
        setWallets(savedWallets);
        const selected = savedWallets.find((item) => item.id === activeId) ?? savedWallets[0] ?? null;
        if (selected && secureWallet.isNative()) {
          setWallet(selected);
          setHistory(await secureWallet.loadHistory(selected.address));
          if (!activeId) await secureWallet.setActiveWallet(selected.id);
        }
      } catch { /* show setup; never log secure-store contents */ }
      finally { if (active) setBooting(false); }
    })();
    return () => { active = false; if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, []);

  useEffect(() => {
    walletAddressRef.current = wallet?.address ?? null;
  }, [wallet?.address]);

  useEffect(() => {
    if (wallet) void refreshPublicData(false);
  // Refresh only when the active wallet changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address]);

  const fetchPrices = useCallback(async () => {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(PRICE_IDS.join(","))}&vs_currencies=usd`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("تعذر تحديث أسعار العرض");
      const data = await response.json();
      const next: Record<string, number> = {};
      for (const [id, value] of Object.entries(data)) {
        const usd = Number((value as { usd?: number }).usd);
        if (Number.isFinite(usd) && usd > 0) next[id] = usd;
      }
      setPrices(next);
    } catch { /* prices are informational; no fabricated fallback */ }
  }, []);

  const fetchHistory = useCallback(async (address: string) => {
    const all: HistoryRecord[] = [];
    const selectedNetworks = NETWORKS.filter((n) => n.id !== "bsc");
    await mapLimit(selectedNetworks, 2, async (n) => {
      const apiBase = `https://api.routescan.io/v2/network/mainnet/evm/${n.chainId}/etherscan/api`;
      for (const action of ["txlist", "tokentx"]) {
        try {
          const url = `${apiBase}?module=account&action=${action}&address=${encodeURIComponent(address)}&page=1&offset=100&sort=desc`;
          const response = await fetch(url);
          if (!response.ok) continue;
          const payload = await response.json();
          if (!Array.isArray(payload.result)) continue;
          for (const tx of payload.result) {
            const symbol = action === "tokentx" ? String(tx.tokenSymbol || "ERC-20").toUpperCase() : n.native;
            const tokenDecimals = action === "tokentx" ? Number(tx.tokenDecimal || n.tokens[symbol]?.decimals || 18) : 18;
            let value: string;
            try { value = formatUnits(BigInt(tx.value || "0"), tokenDecimals); } catch { continue; }
            const timestamp = Number(tx.timeStamp || 0) * 1000;
            let fee: string | undefined;
            try { if (tx.gasUsed && tx.gasPrice) fee = formatEther(BigInt(tx.gasUsed) * BigInt(tx.gasPrice)); } catch { /* fee is optional in indexed records */ }
            all.push({ hash: String(tx.hash || ""), networkId: n.id, networkName: n.name, asset: symbol, amount: value, from: String(tx.from || ""), to: String(tx.to || ""), timestamp, status: tx.isError === "1" || tx.txreceipt_status === "0" ? "failed" : tx.txreceipt_status === "1" || action === "tokentx" ? "success" : "pending", fee, feeAsset: n.native, tokenAddress: action === "tokentx" ? String(tx.contractAddress || "") : undefined, blockNumber: tx.blockNumber ? Number(tx.blockNumber) : undefined, logIndex: action === "tokentx" && tx.logIndex != null ? Number(tx.logIndex) : undefined, transactionType: action === "tokentx" ? "token" : "native", sourceUrl: `${n.explorer}${tx.hash || ""}` });
          }
        } catch { /* explorer availability varies by chain */ }
      }
    });
    if (walletAddressRef.current?.toLowerCase() !== address.toLowerCase()) return;
    const deduped = new Map<string, HistoryRecord>();
    for (const item of all) deduped.set(`${item.networkId}|${item.hash}|${item.tokenAddress || "native"}|${item.logIndex ?? "native"}|${item.transactionType || "native"}`, item);
    const merged = [...deduped.values()].sort((a, b) => b.timestamp - a.timestamp);
    setHistory((old) => {
      const sentLocal = old.filter((item) => item.timestamp >= Date.now() - 7 * 24 * 60 * 60 * 1000 && item.hash && !merged.some((remote) => remote.hash.toLowerCase() === item.hash.toLowerCase()));
      const joined = [...sentLocal, ...merged].sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
      void secureWallet.saveHistory(address, joined);
      return joined;
    });
  }, []);

  const refreshPublicData = useCallback(async (announce = true) => {
    if (!wallet?.address) return;
    setRefreshing(true);
    await fetchPrices();
    const next: BalanceMap = {};
    await mapLimit(NETWORKS, 4, async (n) => {
      try {
        const provider = providerFor(n);
        const nativeRaw = await provider.getBalance(wallet.address);
        const row: Record<string, string> = { [n.native]: formatEther(nativeRaw) };
        for (const [symbol, token] of Object.entries(n.tokens)) {
          const contract = new Contract(token.address, TOKEN_ABI, provider);
          const raw = await contract.balanceOf(wallet.address);
          row[symbol] = formatUnits(raw, token.decimals);
        }
        next[n.id] = row;
      } catch {
        // Missing values remain unknown instead of being represented as a fabricated zero.
      }
    });
    if (walletAddressRef.current?.toLowerCase() !== wallet.address.toLowerCase()) { setRefreshing(false); return; }
    setBalances(next);
    await fetchHistory(wallet.address);
    setRefreshing(false);
    if (announce) showNotice("تم تحديث بيانات الشبكات المتاحة. قد تتعذر بعض نقاط RPC العامة مؤقتًا.");
  }, [wallet, fetchHistory, fetchPrices, showNotice]);

  const assetRows: AssetRow[] = useMemo(() => NETWORKS.flatMap((n) => {
    const row = balances[n.id];
    if (!row) return [];
    return [n.native, ...Object.keys(n.tokens)].map((symbol) => {
      const value = row[symbol];
      const id = ASSET_META[symbol]?.priceId;
      const price = id && prices[id] != null ? prices[id] : (["USDT", "USDC", "USDE"].includes(symbol) ? 1 : null);
      return { key: `${n.id}:${symbol}`, networkId: n.id, networkName: n.name, symbol, amount: value ?? "0", price };
    }).filter((item) => Number(item.amount) > 0);
  }), [balances, prices]);
  const available = balances[network.id]?.[asset];
  const totalKnown = assetRows.reduce((sum, item) => sum + (Number(item.amount) || 0) * (item.price ?? 0), 0);
  const hasKnownAsset = assetRows.some((item) => item.price != null && Number(item.amount) > 0);
  const filteredHistory = history.filter((item) => historyFilter === "all" || (historyFilter === "in" ? item.to.toLowerCase() === wallet?.address.toLowerCase() : item.from.toLowerCase() === wallet?.address.toLowerCase()));
  const selectableAssets = [network.native, ...Object.keys(network.tokens)];

  const haptic = async () => { if (Platform.OS !== "web") { try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ } } };
  const selectPage = (next: Page) => { void haptic(); setPage(next); setNotice(""); };

  const importWallet = async () => {
    if (!secureWallet.isNative()) { showNotice("استيراد المفتاح والتوقيع متاحان في نسخة iOS أو Android الأصلية فقط؛ لن يُخزّن المفتاح في الويب.", true); return; }
    if (!keyInput.trim()) { showNotice("أدخل المفتاح الخاص للمتابعة.", true); return; }
    setBusy(true);
    let candidate = "";
    let storedAddress: string | null = null;
    try {
      candidate = normalizePrivateKey(keyInput);
      const address = deriveAddress(candidate);
      const existing = wallets.find((item) => item.address.toLowerCase() === address.toLowerCase());
      if (existing) {
        await secureWallet.setActiveWallet(existing.id);
        setWallet(existing);
        setHistory(await secureWallet.loadHistory(existing.address));
        setPage("home");
        setShowAddWallet(false);
        showNotice("هذه المحفظة مضافة بالفعل؛ تم فتحها.");
        return;
      }
      const meta: WalletMeta = { id: `${Date.now()}-${address.slice(-8)}`, name: `محفظة ${wallets.length + 1}`, address, importedAt: Date.now() };
      storedAddress = address;
      await secureWallet.savePrivateKey(address, candidate);
      await secureWallet.saveWallet(meta);
      setWallets((old) => [meta, ...old]);
      setWallet(meta);
      setHistory([]);
      setShowAddWallet(false);
      setKeyInput("");
      setPage("home");
      showNotice("تم اشتقاق العنوان وتخزين المفتاح في خزنة الجهاز الآمنة.");
    } catch (error) {
      if (storedAddress) { try { await secureWallet.deletePrivateKey(storedAddress); } catch { /* best-effort cleanup if public metadata storage failed */ } }
      showNotice(error instanceof Error ? error.message : "تعذر إعداد المحفظة بأمان.", true);
    } finally {
      candidate = "";
      setKeyInput("");
      setBusy(false);
    }
  };

  const switchWallet = async (next: WalletMeta) => {
    try {
      await secureWallet.setActiveWallet(next.id);
      setWallet(next);
      setHistory(await secureWallet.loadHistory(next.address));
      setBalances({});
      setPage("home");
      setNotice("");
    } catch (error) { showNotice(error instanceof Error ? error.message : "تعذر فتح المحفظة المختارة.", true); }
  };

  const removeWallet = () => {
    if (!wallet) return;
    Alert.alert("إزالة هذه المحفظة؟", "سيُحذف مفتاح هذه المحفظة وسجلها من هذا الجهاز فقط. بقية المحافظ لن تتأثر. تأكد من امتلاك نسخة احتياطية آمنة من المفتاح قبل المتابعة.", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف المفتاح", style: "destructive", onPress: async () => {
        try {
          await secureWallet.removeWallet(wallet.address, wallet.id);
          const nextWallets = wallets.filter((item) => item.address.toLowerCase() !== wallet.address.toLowerCase());
          setWallets(nextWallets);
          const nextActive = nextWallets[0] ?? null;
          setWallet(nextActive);
          setBalances({});
          setHistory(nextActive ? await secureWallet.loadHistory(nextActive.address) : []);
          setRecipient(""); setAmount(""); setPage("home"); showNotice("أزيلت المحفظة من هذا الجهاز.");
        } catch { showNotice("تعذر إزالة بيانات المحفظة بالكامل.", true); }
      } },
    ]);
  };

  const useMax = async () => {
    if (!available) { showNotice("حدّث الأرصدة أولًا لمعرفة المتاح.", true); return; }
    try {
      let maximum = parseAmount(available, decimals);
      if (asset === network.native) {
        const feeData = await providerFor(network).getFeeData();
        const price = feeData.maxFeePerGas ?? feeData.gasPrice;
        if (!price) throw new Error("رسوم الشبكة غير متاحة؛ تعذر حساب الحد الأقصى الآمن.");
        const gas = withSourceGasMargin(21_000n, false);
        const reserve = (gas * price * 115n) / 100n;
        maximum = maximum > reserve ? maximum - reserve : 0n;
      }
      const nativeAmount = formatUnits(maximum, decimals);
      const displayAmount = unit === "usd" && currentPrice ? Number(nativeAmount) * currentPrice : Number(nativeAmount);
      setAmount(displayAmount > 0 ? String(displayAmount) : "");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "تعذر حساب الحد الأقصى.", true);
    }
  };

  const createReview = async () => {
    if (!wallet) { showNotice("لا توجد محفظة مفتوحة.", true); return; }
    if (!safeAddress(recipient)) { showNotice("تحقق من عنوان المستلم EVM.", true); return; }
    if (!amount.trim() || Number(amount) <= 0) { showNotice("أدخل مبلغًا صحيحًا أكبر من صفر.", true); return; }
    let resolvedAmount = amount.trim();
    try {
      if (unit === "usd") {
        if (currentPrice == null) throw new Error("سعر التحويل غير متاح الآن؛ أدخل الكمية بوحدة الأصل.");
        resolvedAmount = usdToAssetAmount(amount, currentPrice, decimals);
      }
    } catch (error) { showNotice(error instanceof Error ? error.message : "تعذر تحويل المبلغ إلى الأصل.", true); return; }
    let amountWei: bigint;
    try { amountWei = parseAmount(resolvedAmount, decimals); }
    catch (e) { showNotice(e instanceof Error ? e.message : "صيغة المبلغ غير صالحة.", true); return; }
    setBusy(true);
    try {
      const provider = providerFor(network);
      const [nonce, feeData, nativeBalance, tokenBalance] = await Promise.all([
        provider.getTransactionCount(wallet.address, "pending"),
        provider.getFeeData(),
        provider.getBalance(wallet.address),
        asset === network.native ? provider.getBalance(wallet.address) : new Contract(tokenConfig.address, TOKEN_ABI, provider).balanceOf(wallet.address),
      ]);
      const estimatedGasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (!estimatedGasPrice) throw new Error("لم تتوفر بيانات رسوم حديثة من الشبكة.");
      const isToken = asset !== network.native;
      const txTo = isToken ? tokenConfig.address : recipient.trim();
      const txValue = isToken ? 0n : amountWei;
      const data = isToken ? createTokenTransfer(recipient.trim(), amountWei) : "0x";
      let estimatedGas: bigint;
      let usedFallback = false;
      try { estimatedGas = await provider.estimateGas({ from: wallet.address, to: txTo, value: txValue, data }); }
      catch { estimatedGas = isToken ? 100_000n : 21_000n; usedFallback = true; }
      const gasLimit = usedFallback ? estimatedGas : withSourceGasMargin(estimatedGas, isToken);
      const feeWei = gasLimit * estimatedGasPrice;
      const check = balanceCheck({ asset, nativeAsset: network.native, amountWei, feeWei, nativeBalanceWei: nativeBalance, assetBalanceWei: tokenBalance });
      if (!check.ok) throw new Error(check.reason);
      const feeNative = formatEther(feeWei);
      const amountNumber = Number(resolvedAmount);
      const feePrice = prices[ASSET_META[network.native]?.priceId || network.nativePrice] ?? null;
      const amountUsd = currentPrice == null ? null : amountNumber * currentPrice;
      const feeUsd = feePrice == null ? null : Number(feeNative) * feePrice;
      const totalUsd = amountUsd == null || feeUsd == null ? null : amountUsd + feeUsd;
      setFeeReview({ networkId: network.id, asset, amount: resolvedAmount, recipient: recipient.trim(), feeWei: feeWei.toString(), gasLimit: gasLimit.toString(), gasPrice: estimatedGasPrice.toString(), usedFallback, maxFeePerGas: feeData.maxFeePerGas?.toString(), maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(), nonce, txTo, txValue: txValue.toString(), data, feeNative, feeUsd, amountUsd, totalUsd, createdAt: Date.now() });
      setReviewOpen(true);
    } catch (e) {
      showNotice(e instanceof Error ? e.message : "تعذر تقدير الرسوم أو التحقق من الرصيد.", true);
    } finally { setBusy(false); }
  };

  const signAndBroadcast = async () => {
    if (!wallet || !feeReview) return;
    if (!reviewOpen) { showNotice("افتح مراجعة المعاملة ووافق عليها قبل التوقيع.", true); return; }
    const reviewNetwork = NETWORKS.find((n) => n.id === feeReview.networkId);
    if (!reviewNetwork) { showNotice("الشبكة المحددة غير مدعومة.", true); return; }
    if (!canSignReviewedTransaction(reviewOpen, feeReview.createdAt, Date.now())) { setReviewOpen(false); showNotice("انتهت صلاحية تقدير الرسوم. راجع الرسوم مجددًا قبل الإرسال.", true); return; }
    setBusy(true);
    try {
      const privateKey = await secureWallet.getPrivateKey(wallet.address);
      const signer = new Wallet(privateKey);
      if (signer.address.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("لم يطابق المفتاح العنوان المشتق المخزن.");
      const tx = {
        chainId: reviewNetwork.chainId,
        nonce: feeReview.nonce,
        gasLimit: BigInt(feeReview.gasLimit),
        to: feeReview.txTo,
        value: BigInt(feeReview.txValue),
        data: feeReview.data,
        ...(feeReview.maxFeePerGas ? { maxFeePerGas: BigInt(feeReview.maxFeePerGas), maxPriorityFeePerGas: BigInt(feeReview.maxPriorityFeePerGas || "0") } : { gasPrice: BigInt(feeReview.gasPrice) }),
      };
      const signed = await signer.signTransaction(tx);
      setReviewOpen(false);
      const response = await providerFor(reviewNetwork).broadcastTransaction(signed);
      const record: HistoryRecord = { hash: response.hash, networkId: reviewNetwork.id, networkName: reviewNetwork.name, asset: feeReview.asset, amount: feeReview.amount, from: wallet.address, to: feeReview.recipient, timestamp: Date.now(), status: "pending", fee: feeReview.feeNative, feeAsset: reviewNetwork.native, transactionType: feeReview.asset === reviewNetwork.native ? "native" : "token", tokenAddress: feeReview.asset === reviewNetwork.native ? undefined : reviewNetwork.tokens[feeReview.asset]?.address, sourceUrl: `${reviewNetwork.explorer}${response.hash}` };
      setHistory((old) => { const next = [record, ...old.filter((x) => x.hash !== record.hash)].slice(0, 500); void secureWallet.saveHistory(wallet.address, next); return next; });
      setPage("activity");
      showNotice(`بُثّت المعاملة. رقمها: ${shortAddress(response.hash, 10)} — التحقق النهائي يعتمد على الشبكة.`);
      try {
        const receipt = await Promise.race([response.wait(1), new Promise<null>((resolve) => setTimeout(() => resolve(null), 45_000))]);
        if (receipt) {
          setHistory((old) => { const next = old.map((x) => x.hash === response.hash ? { ...x, status: receipt.status === 1 ? "success" as const : "failed" as const } : x); void secureWallet.saveHistory(wallet.address, next); return next; });
          showNotice(receipt.status === 1 ? "تم تأكيد المعاملة." : "أُدرجت المعاملة على الشبكة لكن تنفيذها فشل.", receipt.status !== 1);
          void refreshPublicData(false);
        }
      } catch { /* keep pending, explorer refresh can update later */ }
    } catch (e) {
      showNotice(e instanceof Error ? `لم يتم الإرسال: ${e.message}` : "تعذر توقيع المعاملة أو بثها.", true);
    } finally { setBusy(false); }
  };

  const copyAddress = async () => {
    if (!wallet) return;
    try { await Clipboard.setStringAsync(wallet.address); showNotice("نُسخ عنوان الاستلام."); }
    catch { showNotice("تعذر نسخ العنوان.", true); }
  };

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission();
      if (!response.granted) { showNotice("يلزم إذن الكاميرا لمسح عنوان QR.", true); return; }
    }
    setScannerOpen(true);
  };

  const onScanned = (data: string) => {
    setScannerOpen(false);
    const candidate = data.trim().replace(/^ethereum:/i, "").split("?")[0];
    if (safeAddress(candidate)) { setRecipient(candidate); showNotice("قُرئ عنوان المستلم. تحقق من مطابقته قبل المتابعة."); }
    else showNotice("رمز QR لا يحتوي عنوان EVM صالحًا.", true);
  };

  const renderAsset = ({ item }: { item: AssetRow }) => {
    const meta = ASSET_META[item.symbol] ?? { label: item.symbol, color: C.blue };
    const usd = item.price == null ? null : item.price * Number(item.amount);
    return <Pressable onPress={() => { setNetworkId(item.networkId); setAsset(item.symbol); setPage("send"); }} style={({ pressed }) => [styles.assetRow, pressed && styles.pressed]}>
      <View style={[styles.coinBadge, { backgroundColor: meta.color + "22", borderColor: meta.color + "66" }]}><Text style={[styles.coinGlyph, { color: meta.color }]}>{item.symbol.slice(0, 1)}</Text></View>
      <View style={styles.assetTitle}><Text style={styles.assetSymbol}>{item.symbol}</Text><Text style={styles.miniText}>{meta.label} · {item.networkName}</Text></View>
      <View style={styles.assetNumbers}><Text style={styles.assetAmount}>{qty(item.amount)} {item.symbol}</Text><Text style={styles.miniText}>{money(usd)}</Text></View>
    </Pressable>;
  };

  const renderHistoryItem = ({ item }: { item: HistoryRecord }) => {
    const incoming = item.to.toLowerCase() === wallet?.address.toLowerCase();
    const networkForItem = NETWORKS.find((n) => n.id === item.networkId);
    const unitPrice = prices[ASSET_META[item.asset]?.priceId || networkForItem?.nativePrice || ""] ?? (["USDT", "USDC", "USDE"].includes(item.asset) ? 1 : null);
    const valueUsd = unitPrice == null ? null : Number(item.amount) * unitPrice;
    return <View style={styles.historyRow}>
      <View style={[styles.directionBadge, { backgroundColor: incoming ? C.sage2 : C.copper2 }]}><Text style={{ color: incoming ? C.sage : C.copper, fontWeight: "800" }}>{incoming ? "↓" : "↑"}</Text></View>
      <View style={styles.assetTitle}><Text style={styles.assetSymbol}>{incoming ? "وارد" : "صادر"} · {item.asset}</Text><Text style={styles.miniText}>{item.networkName} · {item.timestamp ? new Date(item.timestamp).toLocaleString("ar") : "—"}</Text><Text style={styles.miniText}>{incoming ? "من " : "إلى "}{shortAddress(incoming ? item.from : item.to)}{item.blockNumber ? ` · كتلة ${item.blockNumber}` : ""}</Text><Text numberOfLines={1} style={styles.monoMuted}>{shortAddress(item.hash, 10)}</Text></View>
      <View style={styles.assetNumbers}><Text style={[styles.assetAmount, { color: incoming ? C.sage : C.ink }]}>{incoming ? "+" : "−"}{qty(item.amount)} {item.asset}</Text><Text style={styles.statusText}>≈ {money(valueUsd)}</Text><Text style={styles.statusText}>{item.fee ? `رسم ${qty(item.fee, 8)} ${item.feeAsset || ""}` : ""}</Text><Text style={styles.statusText}>{item.status === "success" ? "مؤكدة" : item.status === "failed" ? "فشلت" : "قيد الانتظار"}</Text><Pressable onPress={() => { if (item.sourceUrl) void import("expo-linking").then(({ openURL }) => openURL(item.sourceUrl)); }}><Text style={styles.linkText}>مستكشف الشبكة ↗</Text></Pressable></View>
    </View>;
  };

  if (booting) return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.screen}><StatusBar style="light" /><View style={styles.center}><ActivityIndicator color={C.blue} /><Text style={styles.muted}>جارٍ فتح Vaultline…</Text></View></ScreenContainer>;

  if (!wallet) return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.screen}>
    <StatusBar style="light" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.setupScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}><Text style={styles.brandGlyph}>V</Text></View>
        <Text style={styles.wordmark}>VAULTLINE</Text>
        <Text style={styles.setupTitle}>مفتاحك يبقى معك</Text>
        <Text style={styles.setupSub}>محفظة ذاتية الحفظ. أدخل المفتاح الخاص فقط، وسيُشتق عنوانك على هذا الجهاز.</Text>
        <View style={styles.securityCard}><View style={styles.secureIcon}><IconSymbol name="lock.fill" size={20} color={C.sage} /></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>تخزين داخل خزنة الجهاز</Text><Text style={styles.cardSub}>Keychain على iPhone أو Keystore على Android. لن يُرسل المفتاح إلى خادم أو RPC.</Text></View></View>
        {Platform.OS === "web" ? <View style={styles.noticeError}><Text style={styles.noticeErrorText}>لحماية المفتاح، تم تعطيل الإدخال والتوقيع في نسخة الويب. شغّل تطبيق iOS أو Android الأصلي باستخدام Expo.</Text></View> : <>
          <Text style={styles.label}>المفتاح الخاص</Text>
          <TextInput value={keyInput} onChangeText={setKeyInput} secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" keyboardType="ascii-capable" placeholder="الصق المفتاح هنا — لن نطلب عنوانًا عامًا" placeholderTextColor={C.quiet} style={[styles.input, styles.keyInput]} accessibilityLabel="المفتاح الخاص" />
          <View style={styles.warningCard}><Text style={styles.warningText}>لا تدخل مفتاحًا لمحفظة تحتوي أصولًا كبيرة قبل مراجعة التطبيق أمنيًا. المفتاح الذي تدخله يخول التطبيق توقيع معاملات حقيقية.</Text></View>
          <Pressable disabled={busy || !keyInput.trim()} onPress={importWallet} style={({ pressed }) => [styles.primaryButton, (!keyInput.trim() || busy) && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{busy ? "جارٍ الاشتقاق والتخزين الآمن…" : "اشتقاق العنوان وإعداد المحفظة"}</Text></Pressable>
        </>}
        {notice ? <Text style={noticeError ? styles.errorMessage : styles.successMessage}>{notice}</Text> : null}
        <Text style={styles.setupFooter}>لا يوجد إدخال عنوان عام. لا توجد مزامنة سحابية للمفتاح. احتفظ بنسختك الاحتياطية بنفسك.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </ScreenContainer>;

  const homeHeader = <View style={styles.homeHeader}>
    <View style={styles.topRow}><View style={styles.brandInline}><View style={styles.brandDot} /><Text style={styles.wordmarkSmall}>VAULTLINE</Text></View><Pressable onPress={() => setPage("settings")} style={styles.iconButton} accessibilityLabel="الإعدادات"><IconSymbol name="gearshape.fill" size={19} color={C.muted} /></Pressable></View>
    <View style={styles.balanceCard}><View style={styles.balanceGlow} /><Text style={styles.cardEyebrow}>القيمة التقديرية</Text><Text style={styles.balanceText}>{hasKnownAsset ? money(totalKnown) : "—"}</Text><Text style={styles.balanceCaption}>قيمة تقريبية للأصول التي يتوفر سعرها، وليست رصيدًا مضمونًا</Text><View style={styles.addressPill}><Text numberOfLines={1} style={styles.addressText}>{shortAddress(wallet.address, 10)}</Text><Pressable onPress={copyAddress}><Text style={styles.copyTiny}>نسخ</Text></Pressable></View></View>
    <View style={styles.quickActions}><Pressable onPress={() => setPage("send")} style={({ pressed }) => [styles.actionPrimary, pressed && styles.pressed]}><Text style={styles.actionArrow}>↗</Text><Text style={styles.actionPrimaryText}>إرسال</Text></Pressable><Pressable onPress={() => setPage("receive")} style={({ pressed }) => [styles.actionSecondary, pressed && styles.pressed]}><Text style={styles.actionArrowBlue}>↓</Text><Text style={styles.actionSecondaryText}>استلام</Text></Pressable><Pressable onPress={() => void refreshPublicData()} style={({ pressed }) => [styles.iconButtonLarge, pressed && styles.pressed]}><IconSymbol name="arrow.clockwise" size={19} color={C.ink} /></Pressable></View>
    <View style={styles.sectionTitleRow}><View><Text style={styles.sectionTitle}>الأصول</Text><Text style={styles.miniText}>عبر {NETWORKS.length} شبكة مدعومة</Text></View><Text style={styles.assetCount}>{assetRows.length}</Text></View>
    {!assetRows.length ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{refreshing ? "جارٍ قراءة الأرصدة…" : "لا توجد أرصدة مقروءة بعد"}</Text><Text style={styles.miniText}>حدّث البيانات أو تحقق من توفر نقاط RPC العامة.</Text></View> : null}
  </View>;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} style={styles.screen}>
    <StatusBar style="light" />
    <View style={styles.appShell}>
      {page === "home" ? <FlatList data={assetRows} keyExtractor={(item) => item.key} renderItem={renderAsset} ListHeaderComponent={homeHeader} ListEmptyComponent={assetRows.length ? null : <View style={styles.emptyCard}><Text style={styles.miniText}>الأرصدة غير متاحة حاليًا. حاول التحديث بعد قليل.</Text></View>} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshPublicData()} tintColor={C.blue} />} contentContainerStyle={styles.listContent} /> : null}

      {page === "send" ? <KeyboardAvoidingView style={styles.pageFlex} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <PageHeading eyebrow="معاملة جديدة" title="إرسال الأصول" subtitle="سترى الشبكة والرسوم والإجمالي قبل أي توقيع." onBack={() => setPage("home")} />
        <View style={styles.panel}>
          <Text style={styles.label}>الشبكة</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{NETWORKS.map((n) => <Pressable key={n.id} onPress={() => { setNetworkId(n.id); setAsset(n.native); }} style={[styles.chip, network.id === n.id && styles.chipActive]}><Text style={[styles.chipText, network.id === n.id && styles.chipTextActive]}>{n.short}</Text></Pressable>)}</ScrollView>
          <Text style={styles.label}>الأصل</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{selectableAssets.map((s) => <Pressable key={s} onPress={() => setAsset(s)} style={[styles.chip, asset === s && styles.chipActive]}><Text style={[styles.chipText, asset === s && styles.chipTextActive]}>{s}</Text></Pressable>)}</ScrollView>
          <View style={styles.availableRow}><Text style={styles.miniText}>المتاح</Text><Text style={styles.availableText}>{available == null ? "غير متاح" : `${qty(available)} ${asset}`}</Text></View>
          <Text style={styles.label}>عنوان المستلم</Text><View style={styles.recipientRow}><TextInput value={recipient} onChangeText={setRecipient} autoCapitalize="none" autoCorrect={false} spellCheck={false} keyboardType="ascii-capable" placeholder="0x… عنوان EVM" placeholderTextColor={C.quiet} style={[styles.input, styles.recipientInput]} accessibilityLabel="عنوان المستلم" /><Pressable onPress={() => void openScanner()} style={styles.scanButton}><IconSymbol name="qrcode.viewfinder" size={20} color={C.blue} /></Pressable></View>
          <Text style={styles.label}>المبلغ</Text><View style={styles.amountInputRow}><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.quiet} style={[styles.input, styles.amountInput]} accessibilityLabel="المبلغ" /><Pressable onPress={() => setUnit(unit === "asset" ? "usd" : "asset")} style={styles.unitButton}><Text style={styles.unitButtonText}>{unit === "asset" ? asset : "USD"}</Text></Pressable></View>
          <View style={styles.availableRow}><Text style={styles.miniText}>≈ {unit === "usd" ? `${qty(currentPrice ? Number(amount || 0) / currentPrice : 0, 8)} ${asset}` : money(currentPrice == null ? null : Number(amount || 0) * currentPrice)}</Text><Pressable onPress={useMax}><Text style={styles.linkText}>استخدام الحد الأقصى</Text></Pressable></View>
          <View style={styles.noticeBox}><Text style={styles.noticeTitle}>لا توجد عمولة Vaultline</Text><Text style={styles.noticeBody}>المصدر الأصلي يحتسب رسوم الشبكة فقط. الرسم النهائي يعتمد على الغاز الفعلي وسعر الغاز عند مراجعة المعاملة، وقد يتغير قبل التأكيد.</Text></View>
          <Pressable onPress={() => void createReview()} disabled={busy} style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{busy ? "جارٍ تقدير الغاز والرسوم…" : "مراجعة الرسوم والمعاملة"}</Text></Pressable>
        </View>
        {notice ? <InlineNotice text={notice} error={noticeError} /> : null}
      </ScrollView></KeyboardAvoidingView> : null}

      {page === "receive" ? <ScrollView contentContainerStyle={styles.pageContent}><PageHeading eyebrow="استلام" title="عنوان الاستلام" subtitle="أرسل الأصول عبر الشبكة المتوافقة فقط." onBack={() => setPage("home")} /><View style={[styles.panel, styles.receivePanel]}><View style={styles.qrFrame}><QRCode value={wallet.address} size={196} backgroundColor="#FFFFFF" color={C.bg} quietZone={10} /></View><Text style={styles.addressLarge} selectable>{wallet.address}</Text><Pressable onPress={copyAddress} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>نسخ العنوان</Text></Pressable><View style={styles.noticeBox}><Text style={styles.noticeTitle}>انتبه لاختيار الشبكة</Text><Text style={styles.noticeBody}>هذا عنوان EVM واحد، لكن الأصول يجب أن تصل على شبكة مدعومة. تحقق من الشبكة والرمز قبل التحويل.</Text></View></View>{notice ? <InlineNotice text={notice} error={noticeError} /> : null}</ScrollView> : null}

      {page === "activity" ? <View style={styles.pageFlex}><View style={styles.pageContent}><PageHeading eyebrow="النشاط" title="سجل المعاملات" subtitle="المعاملات المسترجعة من المستكشف والمعاملات التي أُرسلت من هذا الجهاز." onBack={() => setPage("home")} /><View style={styles.filterRow}>{([["all", "الكل"], ["in", "واردة"], ["out", "صادرة"]] as const).map(([id, title]) => <Pressable key={id} onPress={() => setHistoryFilter(id)} style={[styles.filterChip, historyFilter === id && styles.filterActive]}><Text style={[styles.chipText, historyFilter === id && styles.chipTextActive]}>{title}</Text></Pressable>)}</View></View><FlatList data={filteredHistory} keyExtractor={(item, index) => `${item.networkId}:${item.hash}:${item.asset}:${index}`} renderItem={renderHistoryItem} ListEmptyComponent={<View style={styles.emptyCard}><Text style={styles.emptyTitle}>لا توجد معاملات ظاهرة</Text><Text style={styles.miniText}>تأكد من الاتصال. دعم الفهرسة يختلف حسب الشبكة؛ BSC يمكن فتح سجلّه مباشرة في BscScan.</Text><Pressable onPress={() => void import("expo-linking").then(({ openURL }) => openURL(`https://bscscan.com/address/${wallet.address}`))}><Text style={styles.linkText}>فتح عنوان BSC في BscScan ↗</Text></Pressable></View>} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshPublicData()} tintColor={C.blue} />} /></View> : null}

      {page === "settings" ? <KeyboardAvoidingView style={styles.pageFlex} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled"><PageHeading eyebrow="الخصوصية" title="الأمان والإعدادات" subtitle="إدارة محافظك المحلية ومفاتيحها بأمان." onBack={() => setPage("home")} /><View style={styles.panel}><Text style={styles.cardTitle}>محافظ على هذا الجهاز</Text><Text style={styles.panelText}>المفاتيح محفوظة منفصلة في خزنة iOS/Android. قائمة المحافظ تحتوي عناوين عامة فقط.</Text>{wallets.map((item) => <Pressable key={item.id} onPress={() => void switchWallet(item)} style={[styles.walletChoice, item.id === wallet.id && styles.walletChoiceActive]}><View style={styles.walletChoiceTop}><Text style={styles.walletChoiceName}>{item.name}{item.id === wallet.id ? " · نشطة" : ""}</Text><Text style={styles.walletChoiceCheck}>{item.id === wallet.id ? "✓" : ""}</Text></View><Text style={styles.walletChoiceAddress}>{shortAddress(item.address, 9)}</Text></Pressable>)}<Pressable onPress={() => { setShowAddWallet((value) => !value); setKeyInput(""); }} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{showAddWallet ? "إخفاء إضافة محفظة" : "＋ إضافة محفظة بمفتاح خاص"}</Text></Pressable>{showAddWallet ? <View style={styles.addWalletBox}>{Platform.OS === "web" ? <View style={styles.noticeError}><Text style={styles.noticeErrorText}>إدخال المفتاح والتوقيع متاحان على تطبيق iOS/Android الأصلي فقط.</Text></View> : <><Text style={styles.label}>المفتاح الخاص الجديد</Text><TextInput value={keyInput} onChangeText={setKeyInput} secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" keyboardType="ascii-capable" placeholder="سيُشتق العنوان تلقائيًا" placeholderTextColor={C.quiet} style={[styles.input, styles.keyInput]} accessibilityLabel="مفتاح خاص لمحفظة إضافية" /><Pressable disabled={busy || !keyInput.trim()} onPress={() => void importWallet()} style={[styles.primaryButton, (!keyInput.trim() || busy) && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? "جارٍ الحفظ الآمن…" : "اشتقاق وإضافة المحفظة"}</Text></Pressable></>}</View> : null}<View style={styles.divider} /><Text style={styles.label}>المفتاح الخاص</Text><Text style={styles.panelText}>يُقرأ من SecureStore مع طلب مصادقة الجهاز عند التوقيع. المفتاح لا يذهب إلى سجل المعاملات أو قاعدة بيانات أو خادم.</Text><Text style={styles.label}>العنوان المشتق</Text><Text style={styles.addressLarge} selectable>{wallet.address}</Text><Pressable onPress={copyAddress} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>نسخ العنوان العام</Text></Pressable><View style={styles.warningCard}><Text style={styles.warningText}>المعاملة الموقعة تُبث عبر مزود RPC المختار، ويصبح محتواها مرئيًا للشبكة. لا يمكن ضمان عدم مراقبة عنوان عام أو معاملة موقعة من مزود اتصال عام.</Text></View><Pressable onPress={removeWallet} style={styles.dangerButton}><Text style={styles.dangerText}>إزالة هذه المحفظة ومفتاحها من الجهاز</Text></Pressable></View>{notice ? <InlineNotice text={notice} error={noticeError} /> : null}</ScrollView></KeyboardAvoidingView> : null}

      {page !== "settings" ? <View style={styles.bottomBar}>{(["home", "activity", "send", "receive"] as Page[]).map((tab) => <Pressable key={tab} onPress={() => selectPage(tab)} style={styles.tabButton}><IconSymbol name={tab === "home" ? "house.fill" : tab === "activity" ? "clock.arrow.circlepath" : tab === "send" ? "arrow.up.right" : "arrow.down.left"} size={20} color={page === tab ? C.blue : C.quiet} /><Text style={[styles.tabText, page === tab && styles.tabTextActive]}>{TAB_LABELS[tab]}</Text></Pressable>)}</View> : null}
      {notice && (page === "home" || page === "activity") ? <View pointerEvents="none" style={[styles.toast, noticeError && styles.toastError]}><Text style={styles.toastText}>{notice}</Text></View> : null}
    </View>

    <Modal visible={reviewOpen} transparent animationType="slide" onRequestClose={() => setReviewOpen(false)}>
      <View style={styles.modalShade}><View style={styles.reviewSheet}><View style={styles.sheetHandle} /><Text style={styles.cardEyebrow}>تحقق قبل التوقيع</Text><Text style={styles.reviewTitle}>مراجعة المعاملة</Text><ScrollView style={{ maxHeight: "65%" }} contentContainerStyle={{ paddingBottom: 4 }}>
        {feeReview ? <>
          <ReviewRow label="الشبكة" value={`${network.name} · Chain ${network.chainId}`} />
          <ReviewRow label="الأصل والمبلغ" value={`${qty(feeReview.amount, 8)} ${feeReview.asset}`} />
          <ReviewRow label="قيمة الأصل التقريبية" value={money(feeReview.amountUsd)} />
          <ReviewRow label="المستلم" value={feeReview.recipient} mono />
          <ReviewRow label="حد الغاز" value={feeReview.gasLimit} />
          <ReviewRow label="سعر الغاز الأقصى" value={`${formatUnits(BigInt(feeReview.gasPrice), 9)} Gwei`} />
          <ReviewRow label="رسوم الشبكة المقدّرة (حد أقصى)" value={`${qty(feeReview.feeNative, 8)} ${network.native}`} />
          <ReviewRow label="قيمة الرسوم التقريبية" value={money(feeReview.feeUsd)} />
          <ReviewRow label="إجمالي الخصم التقريبي" value={`${qty(Number(feeReview.amount) + (feeReview.asset === network.native ? Number(feeReview.feeNative) : 0), 8)} ${feeReview.asset}${feeReview.asset === network.native ? " (يشمل الرسم)" : ` + ${qty(feeReview.feeNative, 8)} ${network.native} رسمًا`}`} strong />
          <ReviewRow label="الإجمالي بالدولار التقريبي" value={money(feeReview.totalUsd)} />
          {feeReview.usedFallback ? <View style={styles.warningCard}><Text style={styles.warningText}>تعذر على الشبكة تقدير الغاز لهذا الطلب؛ استُخدم fallback. تحقق من تفاصيل المعاملة أو ألغها إذا لم تكن متأكدًا.</Text></View> : null}
          <ReviewRow label="الوقت" value="تقدير حي؛ يتغير مع ازدحام الشبكة" />
        </> : null}
        <View style={styles.warningCard}><Text style={styles.warningText}>سيتم التوقيع على هذا الجهاز بعد تأكيدك. الرسوم ليست عمولة Vaultline. الإرسال إلى RPC يبث المعاملة الموقعة علنًا.</Text></View>
      </ScrollView>
      <Pressable disabled={busy} onPress={() => void signAndBroadcast()} style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{busy ? "جارٍ التوقيع والإرسال…" : "أوافق — وقّع وأرسل"}</Text></Pressable>
      <Pressable onPress={() => setReviewOpen(false)} disabled={busy} style={styles.cancelButton}><Text style={styles.secondaryButtonText}>إلغاء دون توقيع</Text></Pressable>
      </View></View>
    </Modal>

    <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}><View style={styles.scannerPage}><Text style={styles.reviewTitle}>مسح عنوان المستلم</Text><Text style={styles.miniText}>لا تمسح المفتاح الخاص أو عبارات الاسترداد.</Text><CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => onScanned(data)} /><Pressable onPress={() => setScannerOpen(false)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>إغلاق الماسح</Text></Pressable></View></Modal>
  </ScreenContainer>;
}

function PageHeading({ eyebrow, title, subtitle, onBack }: { eyebrow: string; title: string; subtitle: string; onBack: () => void }) {
  return <View style={styles.pageHeading}><Pressable onPress={onBack} style={styles.backButton}><IconSymbol name="chevron.right" size={18} color={C.muted} /><Text style={styles.backText}>رجوع</Text></Pressable><Text style={styles.cardEyebrow}>{eyebrow}</Text><Text style={styles.pageTitle}>{title}</Text><Text style={styles.pageSubtitle}>{subtitle}</Text></View>;
}
function InlineNotice({ text, error }: { text: string; error: boolean }) { return <View style={error ? styles.noticeError : styles.noticeSuccess}><Text style={error ? styles.noticeErrorText : styles.noticeSuccessText}>{text}</Text></View>; }
function ReviewRow({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) { return <View style={styles.reviewRow}><Text style={styles.reviewLabel}>{label}</Text><Text selectable style={[styles.reviewValue, mono && styles.mono, strong && { color: C.sage, fontWeight: "800" }]}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, appShell: { flex: 1, backgroundColor: C.bg }, pageFlex: { flex: 1 }, listContent: { paddingBottom: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, muted: { color: C.muted, fontSize: 14, writingDirection: "rtl" },
  setupScroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 32, maxWidth: 560, width: "100%", alignSelf: "center" }, brandMark: { width: 58, height: 58, borderRadius: 20, backgroundColor: C.blue2, borderWidth: 1, borderColor: "#374A85", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 }, brandGlyph: { fontSize: 26, fontWeight: "900", color: C.blue }, wordmark: { fontSize: 12, letterSpacing: 4, color: C.muted, fontWeight: "800", textAlign: "center" }, setupTitle: { fontSize: 30, fontWeight: "800", color: C.ink, textAlign: "center", writingDirection: "rtl", marginTop: 26 }, setupSub: { fontSize: 14, color: C.muted, textAlign: "center", writingDirection: "rtl", lineHeight: 23, marginTop: 10, marginBottom: 24 }, securityCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16, flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 24 }, secureIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.sage2, alignItems: "center", justifyContent: "center" }, cardTitle: { color: C.ink, fontWeight: "700", fontSize: 14, writingDirection: "rtl", textAlign: "right" }, cardSub: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 4, writingDirection: "rtl", textAlign: "right" }, label: { color: C.muted, fontSize: 12, fontWeight: "700", writingDirection: "rtl", textAlign: "right", marginTop: 17, marginBottom: 8 }, input: { height: 50, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 12, color: C.ink, paddingHorizontal: 14, fontSize: 14 }, keyInput: { height: 60, fontSize: 13, letterSpacing: 0.4 }, warningCard: { borderRadius: 12, borderWidth: 1, borderColor: "#4A3C1C", backgroundColor: "#2C2415", padding: 13, marginTop: 15 }, warningText: { color: C.warning, fontSize: 11, lineHeight: 18, textAlign: "right", writingDirection: "rtl" }, primaryButton: { minHeight: 52, backgroundColor: C.blueDeep, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 18, paddingHorizontal: 18 }, primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", writingDirection: "rtl", textAlign: "center" }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] }, setupFooter: { color: C.quiet, fontSize: 11, lineHeight: 17, textAlign: "center", writingDirection: "rtl", marginTop: 20 }, errorMessage: { color: C.copper, fontSize: 12, textAlign: "center", marginTop: 12, writingDirection: "rtl" }, successMessage: { color: C.sage, fontSize: 12, textAlign: "center", marginTop: 12, writingDirection: "rtl" },
  homeHeader: { paddingHorizontal: 18, paddingTop: 8 }, topRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }, brandInline: { flexDirection: "row-reverse", gap: 8, alignItems: "center" }, brandDot: { width: 8, height: 8, borderRadius: 3, backgroundColor: C.blue }, wordmarkSmall: { color: C.ink, fontSize: 12, fontWeight: "800", letterSpacing: 1.5 }, iconButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }, balanceCard: { overflow: "hidden", position: "relative", padding: 21, borderRadius: 22, borderWidth: 1, borderColor: "#2C3C6B", backgroundColor: "#151E38" }, balanceGlow: { position: "absolute", width: 240, height: 160, right: -80, top: -60, borderRadius: 100, backgroundColor: "#473789", opacity: 0.32 }, cardEyebrow: { color: C.quiet, fontSize: 10, fontWeight: "800", letterSpacing: 1.5, textAlign: "right", writingDirection: "rtl" }, balanceText: { color: C.ink, fontSize: 39, fontWeight: "800", letterSpacing: -1, textAlign: "right", marginTop: 8 }, balanceCaption: { color: C.muted, fontSize: 10, textAlign: "right", writingDirection: "rtl", marginTop: 6 }, addressPill: { marginTop: 18, borderRadius: 30, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: "#11192D", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 9 }, addressText: { fontSize: 11, color: C.muted, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", textAlign: "left", writingDirection: "ltr" }, copyTiny: { color: C.blue, fontSize: 11, fontWeight: "700" }, quickActions: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 13 }, actionPrimary: { flex: 1, minHeight: 48, backgroundColor: C.blueDeep, borderRadius: 13, flexDirection: "row-reverse", gap: 8, alignItems: "center", justifyContent: "center" }, actionPrimaryText: { color: "#FFF", fontSize: 13, fontWeight: "800" }, actionSecondary: { flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, flexDirection: "row-reverse", gap: 8, alignItems: "center", justifyContent: "center" }, actionSecondaryText: { color: C.ink, fontSize: 13, fontWeight: "700" }, actionArrow: { color: "white", fontSize: 17 }, actionArrowBlue: { color: C.blue, fontSize: 17 }, iconButtonLarge: { width: 48, height: 48, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }, sectionTitleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 25, marginBottom: 10 }, sectionTitle: { color: C.ink, fontSize: 18, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, miniText: { color: C.quiet, fontSize: 10, textAlign: "right", writingDirection: "rtl", marginTop: 3, lineHeight: 16 }, assetCount: { color: C.blue, fontSize: 11, fontWeight: "700", backgroundColor: C.blue2, borderRadius: 20, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 4 }, emptyCard: { borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, padding: 18, marginTop: 6, alignItems: "flex-end" }, emptyTitle: { color: C.ink, fontSize: 13, fontWeight: "700", writingDirection: "rtl", textAlign: "right" }, assetRow: { minHeight: 72, flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12, marginHorizontal: 18, borderBottomWidth: 1, borderColor: C.line }, coinBadge: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" }, coinGlyph: { fontSize: 15, fontWeight: "800" }, assetTitle: { flex: 1, alignItems: "flex-end", minWidth: 0 }, assetSymbol: { color: C.ink, fontSize: 13, fontWeight: "700", textAlign: "right", writingDirection: "rtl" }, assetNumbers: { alignItems: "flex-start", maxWidth: "45%" }, assetAmount: { color: C.ink, fontSize: 12, fontWeight: "700", textAlign: "left", writingDirection: "ltr" },
  pageContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26 }, pageHeading: { marginBottom: 18 }, backButton: { flexDirection: "row-reverse", alignItems: "center", alignSelf: "flex-start", paddingVertical: 8, marginBottom: 10 }, backText: { color: C.muted, fontSize: 12 }, pageTitle: { color: C.ink, fontSize: 28, fontWeight: "800", textAlign: "right", writingDirection: "rtl", marginTop: 5 }, pageSubtitle: { color: C.muted, fontSize: 12, lineHeight: 19, textAlign: "right", writingDirection: "rtl", marginTop: 5 }, panel: { borderRadius: 19, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, padding: 16 }, chipRow: { flexDirection: "row-reverse", gap: 8, paddingVertical: 2 }, chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 24, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 }, chipActive: { borderColor: C.blue, backgroundColor: C.blue2 }, chipText: { color: C.muted, fontSize: 11, fontWeight: "700" }, chipTextActive: { color: C.blue }, availableRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 9 }, availableText: { color: C.ink, fontSize: 11, fontWeight: "700", writingDirection: "ltr" }, recipientRow: { flexDirection: "row", gap: 8 }, recipientInput: { flex: 1, textAlign: "left", writingDirection: "ltr" }, scanButton: { width: 50, height: 50, borderRadius: 12, backgroundColor: C.blue2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }, amountInputRow: { flexDirection: "row", gap: 8 }, amountInput: { flex: 1, textAlign: "right", writingDirection: "ltr" }, unitButton: { minWidth: 64, height: 50, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }, unitButtonText: { color: C.blue, fontSize: 12, fontWeight: "800" }, noticeBox: { padding: 13, backgroundColor: C.surface2, borderRadius: 12, marginTop: 18, borderWidth: 1, borderColor: C.line }, noticeTitle: { color: C.ink, fontSize: 11, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, noticeBody: { color: C.muted, fontSize: 10, lineHeight: 17, textAlign: "right", writingDirection: "rtl", marginTop: 5 }, linkText: { color: C.blue, fontSize: 10, fontWeight: "700", marginTop: 5, textAlign: "right", writingDirection: "rtl" }, receivePanel: { alignItems: "center" }, qrFrame: { backgroundColor: "white", padding: 9, borderRadius: 16, marginVertical: 8 }, addressLarge: { color: C.ink, fontSize: 11, lineHeight: 18, textAlign: "center", writingDirection: "ltr", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginVertical: 14 }, secondaryButton: { minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, marginTop: 6, alignSelf: "stretch" }, secondaryButtonText: { color: C.ink, fontSize: 12, fontWeight: "700", textAlign: "center" }, panelText: { color: C.muted, fontSize: 12, lineHeight: 20, textAlign: "right", writingDirection: "rtl", marginTop: 8 }, divider: { height: 1, backgroundColor: C.line, marginVertical: 17 }, dangerButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "#6B2C22", backgroundColor: C.copper2, marginTop: 18, alignItems: "center", justifyContent: "center" }, dangerText: { color: C.copper, fontWeight: "800", fontSize: 12, textAlign: "center" },
  filterRow: { flexDirection: "row-reverse", gap: 7, marginBottom: 10 }, filterChip: { borderRadius: 30, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.surface2 }, filterActive: { backgroundColor: C.blue2, borderWidth: 1, borderColor: C.blue }, historyRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 84, borderBottomWidth: 1, borderColor: C.line, paddingVertical: 11 }, directionBadge: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" }, monoMuted: { color: C.quiet, fontSize: 9, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginTop: 4, textAlign: "right" }, statusText: { color: C.muted, fontSize: 9, marginTop: 3, textAlign: "left", writingDirection: "rtl" },
  bottomBar: { minHeight: 66, paddingBottom: Platform.OS === "web" ? 6 : 5, backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.line, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-around" }, tabButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, minHeight: 56 }, tabText: { color: C.quiet, fontSize: 9, fontWeight: "700", writingDirection: "rtl" }, tabTextActive: { color: C.blue }, toast: { position: "absolute", left: 16, right: 16, bottom: Platform.OS === "web" ? 72 : 76, padding: 12, borderRadius: 12, backgroundColor: C.sage2, borderWidth: 1, borderColor: "#1F5C45" }, toastError: { backgroundColor: C.copper2, borderColor: "#6B2C22" }, toastText: { color: C.ink, fontSize: 11, textAlign: "right", writingDirection: "rtl", lineHeight: 17 }, noticeError: { margin: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#6B2C22", backgroundColor: C.copper2 }, noticeErrorText: { color: "#FFB3A3", fontSize: 11, lineHeight: 17, textAlign: "right", writingDirection: "rtl" }, noticeSuccess: { margin: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#1F5C45", backgroundColor: C.sage2 }, noticeSuccessText: { color: "#8FF0C8", fontSize: 11, lineHeight: 17, textAlign: "right", writingDirection: "rtl" },
  modalShade: { flex: 1, backgroundColor: "rgba(0,0,0,0.76)", justifyContent: "flex-end" }, reviewSheet: { backgroundColor: C.surface, borderTopLeftRadius: 25, borderTopRightRadius: 25, borderColor: C.lineStrong, borderWidth: 1, paddingHorizontal: 19, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 28 : 18, maxHeight: "92%" }, sheetHandle: { width: 40, height: 4, borderRadius: 4, backgroundColor: C.lineStrong, alignSelf: "center", marginBottom: 18 }, reviewTitle: { color: C.ink, fontSize: 22, fontWeight: "800", textAlign: "right", writingDirection: "rtl", marginTop: 5, marginBottom: 15 }, reviewRow: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between", gap: 14, paddingVertical: 11, borderBottomWidth: 1, borderColor: C.line }, reviewLabel: { color: C.muted, fontSize: 11, textAlign: "right", writingDirection: "rtl", flex: 1 }, reviewValue: { color: C.ink, fontSize: 11, fontWeight: "600", textAlign: "left", writingDirection: "rtl", flex: 1.3 }, mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", writingDirection: "ltr", fontSize: 9 }, cancelButton: { alignItems: "center", paddingVertical: 14 }, scannerPage: { flex: 1, backgroundColor: C.bg, paddingTop: 58, paddingHorizontal: 18, paddingBottom: 24 },   walletChoice: { marginTop: 10, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2, padding: 13 }, walletChoiceActive: { borderColor: C.blue, backgroundColor: C.blue2 }, walletChoiceTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, walletChoiceName: { color: C.ink, fontSize: 12, fontWeight: "700", textAlign: "right", writingDirection: "rtl" }, walletChoiceCheck: { color: C.sage, fontWeight: "900" }, walletChoiceAddress: { color: C.muted, fontSize: 10, marginTop: 5, textAlign: "left", writingDirection: "ltr", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }, addWalletBox: { marginTop: 14, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg },
  camera: { flex: 1, marginTop: 20, marginBottom: 16, borderRadius: 18, overflow: "hidden" },
});
