import { default as Dexie } from 'dexie';
import { exportDB, importInto } from 'dexie-export-import';

import {
  type DataStorage,
  type IStorage,
  type TAccount,
  type TAccount2,
  type TBalance,
  type TBasketTransaction,
  type TConnection,
  type TContact,
  type TMetadata,
  type TMultisigEvent,
  type TMultisigTransaction,
  type TNotification,
  type TProxy,
  type TProxyGroup,
  type TWallet,
} from '../lib/types';
import { migrateAccounts, migrateEvents, migrateWallets } from '../migration';

import { useMultisigEventStorage } from './multisigEventStorage';
import { useTransactionStorage } from './transactionStorage';

class DexieStorage extends Dexie {
  connections: TConnection;
  balances: TBalance;
  wallets: TWallet;
  /**
   * @deprecated For now it's replaced by accounts2 table, but not wiped for
   *   backup.
   */
  accounts: TAccount;
  accounts2: TAccount2;
  contacts: TContact;
  multisigTransactions: TMultisigTransaction;
  multisigEvents: TMultisigEvent;
  notifications: TNotification;
  metadata: TMetadata;
  proxies: TProxy;
  proxyGroups: TProxyGroup;
  basketTransactions: TBasketTransaction;

  constructor() {
    super('spektr');

    this.version(16).stores({
      connections: '++id,chainId,type',
      wallets: '++id,isActive,type',
      balances: '[accountId+chainId+assetId],[accountId+chainId]',
      accounts: '++id,isActive,walletId,rootId,signingType',
      contacts: '++id,name,accountId,matrixId',
      multisigTransactions:
        '[accountId+chainId+callHash+blockCreated+indexCreated],[accountId+status],[accountId+callHash],[callHash+status+chainId],accountId,status,callHash',
      notifications: '++id,type,read',
    });

    this.version(17)
      .stores({
        multisigEvents: '++id,[txAccountId+txChainId+txCallHash+txBlock+txIndex],status,accountId',
      })
      .upgrade(migrateEvents);

    this.version(19)
      .stores({
        wallets: '++id',
        contacts: '++id',
        accounts: '++id',
        metadata: '[chainId+version],chainId',
      })
      .upgrade(migrateWallets);

    this.version(21).stores({
      proxies: '++id',
      proxyGroups: '++id',
      connections: '++id',
      notifications: '++id',
      metadata: null,
    });

    this.version(22).stores({
      metadata: '++id',
    });

    this.version(23).stores({
      basketTransactions: '++id',
    });

    this.version(24).stores({
      metadata: null,
    });

    this.version(25).stores({
      metadata: '++id',
    });

    this.version(26)
      .stores({
        accounts2: 'id',
      })
      .upgrade(migrateAccounts);

    this.connections = this.table('connections');
    this.balances = this.table('balances');
    this.wallets = this.table('wallets');
    this.accounts = this.table('accounts');
    this.accounts2 = this.table('accounts2');
    this.contacts = this.table('contacts');
    this.multisigTransactions = this.table('multisigTransactions');
    this.multisigEvents = this.table('multisigEvents');
    this.notifications = this.table('notifications');
    this.metadata = this.table('metadata');
    this.proxies = this.table('proxies');
    this.proxyGroups = this.table('proxyGroups');
    this.basketTransactions = this.table('basketTransactions');
  }
}

class StorageFactory implements IStorage {
  private dexieDB: DexieStorage;

  constructor(dexie: DexieStorage) {
    this.dexieDB = dexie;
  }

  public connectTo<T extends keyof DataStorage>(name: T): DataStorage[T] | undefined {
    switch (name) {
      case 'multisigTransactions':
        return useTransactionStorage(this.dexieDB.multisigTransactions) as DataStorage[T];
      case 'multisigEvents':
        return useMultisigEventStorage(this.dexieDB.multisigEvents) as DataStorage[T];
      default:
        return undefined;
    }
  }
}

const dexie = new DexieStorage();

export const exportDb = async () => {
  const blob = await exportDB(dexie, {
    prettyJson: true,
    skipTables: ['metadata', 'balances', 'proxies', 'proxyGroups', 'basketTransactions', 'connections'],
  });

  return { blob, fileName: 'spektr-database.json' };
};

export const importDb = async (blob: Blob) => {
  await importInto(dexie, blob, { acceptVersionDiff: true });
};

export const storage = new StorageFactory(dexie);

export const dexieStorage = {
  wallets: dexie.wallets,
  accounts: dexie.accounts,
  accounts2: dexie.accounts2,
  contacts: dexie.contacts,
  connections: dexie.connections,
  proxies: dexie.proxies,
  proxyGroups: dexie.proxyGroups,
  notifications: dexie.notifications,
  metadata: dexie.metadata,
  balances: dexie.balances,
  basketTransactions: dexie.basketTransactions,
};
