import { type ApiPromise } from '@polkadot/api';
import { type BN, BN_ZERO } from '@polkadot/util';
import { createEffect, createEvent, createStore, restore, sample } from 'effector';
import { combineEvents } from 'patronum';

import { type ClaimTimeAt, type UnlockChunk, UnlockChunkType } from '@shared/api/governance';
import { type Address, type Referendum, type TrackId, type TrackInfo, type VotingMap } from '@shared/core';
import { Step, getCreatedDateFromApi, getCurrentBlockNumber } from '@shared/lib/utils';
import { claimScheduleService, referendumModel } from '@entities/governance';
import { walletModel } from '@entities/wallet';
import { tracksAggregate } from '../aggregates/tracks';
import { votingAggregate } from '../aggregates/voting';
import { unlockService } from '../lib/unlockService';

import { locksModel } from './locks';
import { networkSelectorModel } from './networkSelector';

const stepChanged = createEvent<Step>();
const flowStarted = createEvent();
const flowFinished = createEvent();
const txSaved = createEvent();

const $step = restore<Step>(stepChanged, Step.NONE);
const $claimSchedule = createStore<UnlockChunk[]>([]).reset(walletModel.$activeWallet);
const $totalUnlock = createStore<BN>(BN_ZERO);

type Props = {
  api: ApiPromise;
  referendums: Referendum[];
  tracks: Record<TrackId, TrackInfo>;
  trackLocks: Record<Address, Record<TrackId, BN>>;
  voting: VotingMap;
};

const getClaimScheduleFx = createEffect(
  async ({ api, referendums, tracks, trackLocks, voting }: Props): Promise<UnlockChunk[]> => {
    const currentBlockNumber = await getCurrentBlockNumber(api);
    const undecidingTimeout = api.consts.referenda.undecidingTimeout.toNumber();
    const voteLockingPeriod = api.consts.convictionVoting.voteLockingPeriod.toNumber();

    const claims = Object.entries(trackLocks).flatMap(([address, trackLock]) => {
      const claimSchedule = claimScheduleService.estimateClaimSchedule({
        currentBlockNumber,
        referendums,
        tracks,
        trackLocks: trackLock,
        votingByTrack: voting[address],
        voteLockingPeriod,
        undecidingTimeout,
      });

      return unlockService.filterClaims(claimSchedule, address);
    });

    return Promise.all(
      claims.map((claim) => {
        if (claim.type !== UnlockChunkType.PENDING_LOCK) return claim;

        return getCreatedDateFromApi((claim.claimableAt as ClaimTimeAt).block, api).then((timeToBlock) => ({
          ...claim,
          timeToBlock,
        }));
      }),
    ).then((result) => result);
  },
);

// const $unlockStore = createStore<UnlockStore | null>(null);

// const $initiatorWallet = combine(
//   {
//     store: $unlockStore,
//     wallets: walletModel.$wallets,
//   },
//   ({ store, wallets }) => {
//     if (!store) return undefined;

//     return walletUtils.getWalletById(wallets, store.shards[0].walletId);
//   },
//   { skipVoid: false },
// );

sample({
  clock: [
    referendumModel.events.requestDone,
    combineEvents([locksModel.events.requestDone, votingAggregate.events.requestDone]),
  ],
  source: {
    api: networkSelectorModel.$governanceChainApi,
    tracks: tracksAggregate.$tracks,
    trackLocks: locksModel.$trackLocks,
    voting: votingAggregate.$voting,
    referendums: referendumModel.$referendums,
    chain: networkSelectorModel.$governanceChain,
  },
  filter: ({ api, chain, referendums }) => !!api && !!chain && !!referendums,
  fn: ({ api, tracks, trackLocks, voting, referendums, chain }) => ({
    api: api!,
    tracks,
    trackLocks,
    voting,
    referendums: referendums[chain!.chainId],
  }),
  target: getClaimScheduleFx,
});

sample({
  clock: getClaimScheduleFx.doneData,
  target: $claimSchedule,
});

sample({
  clock: getClaimScheduleFx.doneData,
  fn: (claimSchedule) => {
    const unlockable = claimSchedule.reduce((acc, claim) => {
      if (claim.type !== UnlockChunkType.CLAIMABLE) return acc;

      return acc.add(claim.amount);
    }, BN_ZERO);

    return unlockable;
  },
  target: $totalUnlock,
});

sample({
  clock: flowStarted,
  fn: () => Step.INIT,
  target: stepChanged,
});

sample({
  clock: flowFinished,
  fn: () => Step.NONE,
  target: stepChanged,
});

sample({
  clock: txSaved,
  fn: () => Step.BASKET,
  target: stepChanged,
});

export const unlockModel = {
  $step,
  $pendingSchedule: $claimSchedule.map((c) => c.filter((claim) => claim.type !== UnlockChunkType.CLAIMABLE)),
  $isLoading: getClaimScheduleFx.pending || referendumModel.$isReferendumsLoading,
  $isUnlockable: $claimSchedule.map((c) => c.some((claim) => claim.type === UnlockChunkType.CLAIMABLE)),
  $totalUnlock,

  events: {
    flowStarted,
    stepChanged,
  },
  output: {
    flowFinished,
  },
};