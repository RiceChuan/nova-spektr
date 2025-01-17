import { createEvent, createStore, sample } from 'effector';
import { persist } from 'effector-storage/session';

import { isDev } from '@/shared/lib/utils';

export const updateFeatureStatus = createEvent<[feature: string, status: boolean]>();
export const resetFeatureStatuses = createEvent();

export const $features = createStore({
  assets: true,
  staking: true,
  governance: true,
  // TODO: Dev only
  fellowship: isDev(),
  importDB: isDev(),
  operations: true,
  basket: true,
  contacts: true,
  notifications: true,
  settings: true,

  multisig: true,
  flexibleMultisig: true,
  proxy: true,
  polkadotVault: true,
  walletConnect: true,
  watchOnly: true,
  ledger: true,
});

persist({
  key: 'feature-toggle',
  store: $features,
});

sample({
  clock: updateFeatureStatus,
  source: $features,
  filter: (features, [feature]) => feature in features,
  fn: (features, [feature, status]) => ({ ...features, [feature]: status }),
  target: $features,
});

sample({
  clock: resetFeatureStatuses,
  target: $features.reinit,
});
