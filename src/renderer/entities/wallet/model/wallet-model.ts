import { type UnitValue, combine, createEffect, createEvent, createStore, sample } from 'effector';
import { readonly } from 'patronum';

import { storageService } from '@/shared/api/storage';
import {
  type Account,
  type FlexibleMultisigAccount,
  type ID,
  type MultisigAccount,
  type NoID,
  type ProxiedAccount,
  type VaultBaseAccount,
  type VaultChainAccount,
  type VaultShardAccount,
  type Wallet,
  type WcAccount,
} from '@/shared/core';
import { dictionary, groupBy, nonNullable, nullable } from '@/shared/lib/utils';
// TODO wallet model should be either in wallets domain or wallets feature
// eslint-disable-next-line boundaries/element-types
import {
  type AnyAccount,
  type ChainAccount,
  type UniversalAccount,
  accounts,
  accountsService,
} from '@/domains/network';
import { modelUtils } from '../lib/model-utils';

type DbWallet = Omit<Wallet, 'accounts'>;

export type CreateParams<T extends AnyAccount = AnyAccount> = {
  wallet: Omit<NoID<Wallet>, 'isActive' | 'accounts'>;
  accounts: (T extends any ? Omit<NoID<T>, 'walletId'> : never)[];
  // external means wallet was created by someone else and discovered later
  // TODO this flag is related to multisig creation and should disappear after wallet feature decomposition
  external: boolean;
};

const walletStarted = createEvent();
const watchOnlyCreated = createEvent<CreateParams<VaultBaseAccount>>();
const multishardCreated = createEvent<CreateParams<VaultBaseAccount | VaultChainAccount | VaultShardAccount>>();
const singleshardCreated = createEvent<CreateParams<VaultBaseAccount>>();
const multisigCreated = createEvent<CreateParams<MultisigAccount>>();
const flexibleMultisigCreated = createEvent<CreateParams<FlexibleMultisigAccount>>();
const walletConnectCreated = createEvent<CreateParams<WcAccount>>();
const proxiedCreated = createEvent<CreateParams<ProxiedAccount>>();

const walletRestored = createEvent<Wallet>();
const walletHidden = createEvent<Wallet>();
const walletRemoved = createEvent<ID>();
const walletsRemoved = createEvent<ID[]>();
const selectWallet = createEvent<ID>();
// TODO this is temp solution, each type of wallet should update own data inside feature
const updateWallet = createEvent<{ walletId: ID; data: NonNullable<unknown> }>();
const updateWalletWithDB = createEvent<Wallet>();

const $rawWallets = createStore<DbWallet[]>([]);

const $allWallets = combine($rawWallets, accounts.$list, (wallets, accounts) => {
  const grouped = groupBy(accounts, (a) => a.walletId);

  return wallets.map((wallet) => ({ ...wallet, accounts: grouped[wallet.id] ?? [] })) as Wallet[];
});
const $wallets = $allWallets.map((wallets) => wallets.filter((x) => !x.isHidden));
const $hiddenWallets = $allWallets.map((wallets) => wallets.filter((x) => x.isHidden));

// TODO: ideally it should be a feature
const $activeWallet = combine(
  $wallets,
  (wallets) => {
    return wallets.find((wallet) => wallet.isActive);
  },
  { skipVoid: false },
);

// TODO: ideally it should be a feature
const $activeAccounts = combine($activeWallet, accounts.$list, (wallet, accounts) => {
  if (nullable(wallet)) return [];

  return accountsService.filterAccountsByWallet(accounts, wallet.id);
});

const fetchAllWalletsFx = createEffect(async (): Promise<DbWallet[]> => {
  const wallets = await storageService.wallets.readAll();

  // Deactivate wallets except first one if more than one selected
  const activeWallets = wallets.filter((wallet) => wallet.isActive);

  if (activeWallets.length > 1) {
    const inactiveWallets = activeWallets.slice(1).map((wallet) => ({ ...wallet, isActive: false }));
    await storageService.wallets.updateAll(inactiveWallets);

    const walletsMap = dictionary(wallets, 'id');

    for (const wallet of inactiveWallets) {
      walletsMap[wallet.id] = wallet;
    }

    return Object.values(walletsMap);
  }

  return wallets;
});

type CreateResult = {
  wallet: DbWallet;
  accounts: AnyAccount[];
  external: boolean;
};
const walletCreatedFx = createEffect(
  async ({ wallet, accounts: accountDrafts, external }: CreateParams): Promise<CreateResult | undefined> => {
    const dbWallet = await storageService.wallets.create({ ...wallet, isActive: false });

    if (!dbWallet) return undefined;

    const accountsPayload = accountDrafts.map(
      (account) => ({ ...account, walletId: dbWallet.id }) as ChainAccount | UniversalAccount,
    );

    const dbAccounts = await accounts.createAccounts(accountsPayload);

    return { wallet: dbWallet, accounts: dbAccounts, external };
  },
);

const multishardCreatedFx = createEffect(
  async ({
    wallet,
    accounts: accountDrafts,
    external,
  }: UnitValue<typeof multishardCreated>): Promise<(CreateResult & { external: boolean }) | undefined> => {
    const dbWallet = await storageService.wallets.create({ ...wallet, isActive: false });

    if (!dbWallet) return undefined;

    const { base, chains, shards } = modelUtils.groupAccounts(accountDrafts);

    const multishardAccounts = [];

    for (const [index, baseAccount] of base.entries()) {
      // TODO fix
      const [dbBaseAccount] = await accounts.createAccounts([{ ...baseAccount, walletId: dbWallet.id }]);
      if (!dbBaseAccount) return undefined;

      multishardAccounts.push(dbBaseAccount);
      let accountPayloads: NoID<Account>[] = [];

      if (chains[index]) {
        accountPayloads = accountPayloads.concat(
          chains[index].map((account) => ({
            ...account,
            walletId: dbWallet.id,
            baseAccountId: baseAccount.accountId,
          })),
        );
      }

      if (shards[index]) {
        accountPayloads = accountPayloads.concat(
          shards[index].map((account) => ({
            ...account,
            walletId: dbWallet.id,
          })),
        );
      }

      if (accountPayloads.length === 0) {
        continue;
      }

      // @ts-expect-error fix it later
      const dbChainAccounts = await accounts.createAccounts(accountPayloads);
      if (!dbChainAccounts.length) return undefined;

      multishardAccounts.push(...dbChainAccounts);
    }

    return { wallet: dbWallet, accounts: multishardAccounts, external };
  },
);

const removeWalletFx = createEffect(async (wallet: Wallet): Promise<ID> => {
  await Promise.all([accounts.deleteAccounts(wallet.accounts), storageService.wallets.delete(wallet.id)]);

  return wallet.id;
});

const updateWalletFx = createEffect(async (wallet: Wallet): Promise<Wallet> => {
  await storageService.wallets.update(wallet.id, wallet);

  return wallet;
});

const removeWalletsFx = createEffect(async (wallets: Wallet[]): Promise<ID[]> => {
  const walletIds: ID[] = [];
  let accountstoRemove: AnyAccount[] = [];

  for (const wallet of wallets) {
    walletIds.push(wallet.id);
    accountstoRemove = accountstoRemove.concat(wallet.accounts);
  }

  await Promise.all([storageService.wallets.deleteAll(walletIds), accounts.deleteAccounts(accountstoRemove)]);

  return walletIds;
});

const hideWalletFx = createEffect(async (wallet: Wallet): Promise<Wallet> => {
  await storageService.wallets.update(wallet.id, { isHidden: true });

  return wallet;
});

const restoreWalletFx = createEffect(async (wallet: Wallet): Promise<Wallet> => {
  await storageService.wallets.update(wallet.id, { isHidden: false });

  return wallet;
});

const walletSelectedFx = createEffect(async (nextId: ID): Promise<ID | undefined> => {
  const wallets = await storageService.wallets.readAll();
  const inactiveWallets = wallets.filter((wallet) => wallet.isActive).map((wallet) => ({ ...wallet, isActive: false }));

  const [, nextWallet] = await Promise.all([
    storageService.wallets.updateAll(inactiveWallets),
    storageService.wallets.update(nextId, { isActive: true }),
  ]);

  return nextWallet;
});

sample({
  clock: walletStarted,
  target: [accounts.populate, fetchAllWalletsFx],
});

sample({
  clock: fetchAllWalletsFx.doneData,
  target: $rawWallets,
});

const walletCreatedDone = sample({
  clock: [walletCreatedFx.doneData, multishardCreatedFx.doneData],
}).filter({ fn: nonNullable });

const walletCreationFail = sample({
  clock: [walletCreatedFx.fail, multishardCreatedFx.fail],
}).filter({ fn: nonNullable });

sample({
  clock: [
    walletConnectCreated,
    watchOnlyCreated,
    multisigCreated,
    flexibleMultisigCreated,
    singleshardCreated,
    proxiedCreated,
  ],
  target: walletCreatedFx,
});

sample({
  clock: multishardCreated,
  target: multishardCreatedFx,
});

sample({
  clock: walletCreatedDone,
  source: $rawWallets,
  fn: (wallets, data) => {
    return wallets.concat(data.wallet);
  },
  target: $rawWallets,
});

sample({
  clock: walletRemoved,
  source: $allWallets,
  filter: (wallets, walletId) => {
    return wallets.some((wallet) => wallet.id === walletId);
  },
  fn: (wallets, walletId) => {
    return wallets.find((wallet) => wallet.id === walletId)!;
  },
  target: removeWalletFx,
});

sample({
  clock: walletsRemoved,
  source: $allWallets,
  filter: (wallets, walletIds) => {
    return wallets.some((wallet) => walletIds.includes(wallet.id));
  },
  fn: (wallets, walletIds) => {
    return wallets.filter((wallet) => walletIds.includes(wallet.id));
  },
  target: removeWalletsFx,
});

sample({
  clock: removeWalletFx.doneData,
  source: $rawWallets,
  fn: (wallets, walletId) => {
    return wallets.filter((wallet) => wallet.id !== walletId);
  },
  target: $rawWallets,
});

sample({
  clock: removeWalletsFx.doneData,
  source: $rawWallets,
  fn: (wallets, walletIds) => {
    return wallets.filter((wallet) => !walletIds.includes(wallet.id));
  },
  target: $rawWallets,
});

sample({
  clock: walletHidden,
  target: hideWalletFx,
});

sample({
  clock: hideWalletFx.doneData,
  source: $rawWallets,
  fn: (wallets, walletToHide) => {
    return wallets.map((wallet) => {
      return wallet.id === walletToHide.id ? { ...wallet, isHidden: true } : wallet;
    });
  },
  target: $rawWallets,
});

sample({
  clock: walletRestored,
  source: $hiddenWallets,
  filter: (hiddenWallets, walletToRestore) => {
    return hiddenWallets.some((wallet) => wallet.id === walletToRestore.id);
  },
  fn: (_, walletToRestore) => walletToRestore,
  target: restoreWalletFx,
});

sample({
  clock: restoreWalletFx.doneData,
  source: $rawWallets,
  fn: (wallets, walletToRestore) => {
    return wallets.map((wallet) => {
      return wallet.id === walletToRestore.id ? { ...wallet, isHidden: false } : wallet;
    });
  },
  target: $rawWallets,
});

sample({ clock: selectWallet, target: walletSelectedFx });

sample({
  clock: walletSelectedFx.doneData,
  source: $rawWallets,
  filter: (_, nextId) => Boolean(nextId),
  fn: (wallets, nextId) => {
    return wallets.map((wallet) => ({ ...wallet, isActive: wallet.id === nextId }));
  },
  target: $rawWallets,
});

sample({
  clock: updateWallet,
  source: $rawWallets,
  fn: (wallets, { walletId, data }) => {
    return wallets.map((wallet) => {
      return wallet.id === walletId ? { ...wallet, ...data } : wallet;
    });
  },
  target: $rawWallets,
});

sample({
  clock: updateWalletWithDB,
  target: updateWalletFx,
});

sample({
  clock: updateWalletFx.doneData,
  fn: (wallet) => ({ walletId: wallet.id, data: wallet }),
  target: updateWallet,
});

export const walletModel = {
  $wallets,
  $allWallets: readonly($allWallets),
  $hiddenWallets,
  $activeWallet,
  $activeAccounts,
  $isLoadingWallets: fetchAllWalletsFx.pending,

  events: {
    walletStarted,
    watchOnlyCreated,
    multishardCreated,
    singleshardCreated,
    multisigCreated,
    flexibleMultisigCreated,
    walletConnectCreated,
    proxiedCreated,
    walletCreatedDone,
    walletCreationFail,
    selectWallet,
    updateWallet,
    updateWalletWithDB,
    walletRemoved,
    walletHidden,
    walletHiddenSuccess: hideWalletFx.done,
    walletRemovedSuccess: removeWalletFx.done,
    walletsRemoved,
    walletRestored,
    walletRestoredSuccess: restoreWalletFx.done,
  },

  __test: {
    $rawWallets,
    walletCreatedFx,
  },
};
