import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PRIVATE_KEY_PREFIX = "vaultline.wallet.private-key.v1.";
const WALLETS_SLOT = "vaultline.wallets.public-meta.v1";
const ACTIVE_WALLET_SLOT = "vaultline.wallet.active.v1";
const HISTORY_PREFIX = "vaultline.wallet.history.v1.";
const historySlot = (address: string) => `${HISTORY_PREFIX}${address.toLowerCase()}`;

export type WalletMeta = { id: string; name: string; address: string; importedAt: number };
export type HistoryRecord = {
  hash: string;
  networkId: string;
  networkName: string;
  asset: string;
  amount: string;
  from: string;
  to: string;
  timestamp: number;
  status: "pending" | "success" | "failed";
  fee?: string;
  feeAsset?: string;
  tokenAddress?: string;
  blockNumber?: number;
  logIndex?: number;
  transactionType?: "native" | "token";
  sourceUrl: string;
};

const secureOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: "افتح خزنة Vaultline لتأكيد الإجراء بأمان",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const keySlot = (address: string) => `${PRIVATE_KEY_PREFIX}${address.toLowerCase()}`;

export const secureWallet = {
  isNative(): boolean { return Platform.OS === "ios" || Platform.OS === "android"; },

  async savePrivateKey(address: string, key: string): Promise<void> {
    if (!secureWallet.isNative()) throw new Error("إدخال المفاتيح الخاصة متاح فقط في تطبيق iOS أو Android الأصلي، وليس في الويب.");
    if (!(await SecureStore.isAvailableAsync())) throw new Error("التخزين الآمن غير متاح على هذا الجهاز.");
    await SecureStore.setItemAsync(keySlot(address), key, secureOptions);
  },

  async getPrivateKey(address: string): Promise<string> {
    if (!secureWallet.isNative()) throw new Error("التوقيع غير متاح في نسخة الويب.");
    const key = await SecureStore.getItemAsync(keySlot(address), secureOptions);
    if (!key) throw new Error("تعذر فتح المفتاح من التخزين الآمن. أعد استيراد هذه المحفظة على هذا الجهاز.");
    return key;
  },

  async deletePrivateKey(address: string): Promise<void> {
    if (!secureWallet.isNative()) return;
    await SecureStore.deleteItemAsync(keySlot(address));
  },

  async loadWallets(): Promise<WalletMeta[]> {
    const raw = await AsyncStorage.getItem(WALLETS_SLOT);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(item.address)) as WalletMeta[] : [];
    } catch { return []; }
  },

  async saveWallet(meta: WalletMeta): Promise<void> {
    const wallets = await secureWallet.loadWallets();
    const next = [meta, ...wallets.filter((item) => item.address.toLowerCase() !== meta.address.toLowerCase())];
    await AsyncStorage.setItem(WALLETS_SLOT, JSON.stringify(next));
    await AsyncStorage.setItem(ACTIVE_WALLET_SLOT, meta.id);
  },

  async setActiveWallet(id: string): Promise<void> {
    const wallets = await secureWallet.loadWallets();
    if (!wallets.some((item) => item.id === id)) throw new Error("المحفظة المختارة غير موجودة على الجهاز.");
    await AsyncStorage.setItem(ACTIVE_WALLET_SLOT, id);
  },

  async loadActiveWalletId(): Promise<string | null> {
    return AsyncStorage.getItem(ACTIVE_WALLET_SLOT);
  },

  async removeWallet(address: string, id: string): Promise<void> {
    await secureWallet.deletePrivateKey(address);
    const wallets = (await secureWallet.loadWallets()).filter((item) => item.address.toLowerCase() !== address.toLowerCase());
    await AsyncStorage.setItem(WALLETS_SLOT, JSON.stringify(wallets));
    const activeId = await secureWallet.loadActiveWalletId();
    if (activeId === id) {
      if (wallets[0]) await AsyncStorage.setItem(ACTIVE_WALLET_SLOT, wallets[0].id);
      else await AsyncStorage.removeItem(ACTIVE_WALLET_SLOT);
    }
    await AsyncStorage.removeItem(historySlot(address));
  },

  async loadHistory(address: string): Promise<HistoryRecord[]> {
    const raw = await AsyncStorage.getItem(historySlot(address));
    if (!raw) return [];
    try {
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value as HistoryRecord[] : [];
    } catch { return []; }
  },

  async saveHistory(address: string, history: HistoryRecord[]): Promise<void> {
    await AsyncStorage.setItem(historySlot(address), JSON.stringify(history.slice(0, 500)));
  },
};
