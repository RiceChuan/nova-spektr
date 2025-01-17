import { combine } from 'effector';

import { nullable } from '@/shared/lib/utils';
import { collectiveDomain } from '@/domains/collectives';

import { votingHistoryFeatureStatus } from './status';

const $fellowshipStore = collectiveDomain.$store.map(store => store['fellowship'] || null);

const $store = combine($fellowshipStore, votingHistoryFeatureStatus.state, (fellowshipStore, state) => {
  if (nullable(fellowshipStore) || state.status !== 'running') {
    return null;
  }

  return fellowshipStore[state.data.chainId] ?? null;
});

export const fellowshipModel = {
  $store,
};
