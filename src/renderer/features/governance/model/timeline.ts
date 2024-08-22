import { type ApiPromise } from '@polkadot/api';
import { combine, createEffect, createEvent, createStore, sample } from 'effector';
import { produce } from 'immer';
import { readonly } from 'patronum';

import {
  type GovernanceApi,
  type ReferendumTimelineRecord,
  type ReferendumTimelineRecordStatus,
} from '@shared/api/governance';
import {
  type Chain,
  type ChainId,
  type CompletedReferendum,
  type Referendum,
  type ReferendumId,
  ReferendumType,
} from '@shared/core';
import { getCreatedDateFromApi, nonNullable } from '@shared/lib/utils';
import { governanceModel, referendumService } from '@entities/governance';

import { networkSelectorModel } from './networkSelector';

const referendumTimelineStatus: Record<CompletedReferendum['type'], ReferendumTimelineRecordStatus> = {
  [ReferendumType.Killed]: 'Killed',
  [ReferendumType.Cancelled]: 'Cancelled',
  [ReferendumType.Rejected]: 'Rejected',
  [ReferendumType.Approved]: 'Approved',
  [ReferendumType.TimedOut]: 'TimedOut',
};

const $timelines = createStore<
  Record<ChainId, Record<ReferendumId, { onChain: ReferendumTimelineRecord[]; offChain: ReferendumTimelineRecord[] }>>
>({});

const $currentChainTimelines = combine($timelines, networkSelectorModel.$governanceChain, (timelines, chain) => {
  if (!chain) {
    return {};
  }

  return timelines[chain.chainId] ?? {};
});

const requestTimeline = createEvent<{ referendum: Referendum }>();

// off chain

type RequestOffTimelineParams = {
  service: GovernanceApi;
  chain: Chain;
  referendum: Referendum;
};

const requestOffChainTimelineFx = createEffect<RequestOffTimelineParams, ReferendumTimelineRecord[]>(
  ({ service, chain, referendum }) => service.getReferendumTimeline(chain, referendum.referendumId),
);

sample({
  clock: requestTimeline,
  source: {
    chain: networkSelectorModel.$governanceChain,
    api: governanceModel.$governanceApi,
  },
  filter: ({ chain, api }) => nonNullable(chain) && nonNullable(api),
  fn: ({ chain, api }, { referendum }) => ({
    service: api!.service,
    chain: chain!,
    referendum,
  }),
  target: requestOffChainTimelineFx,
});

sample({
  clock: requestOffChainTimelineFx.done,
  source: $timelines,
  fn: (timelines, { params: { chain, referendum }, result }) => {
    return produce(timelines, (draft) => {
      let chainReferendums = draft[chain.chainId];
      if (!chainReferendums) {
        chainReferendums = {};
        draft[chain.chainId] = chainReferendums;
      }

      let referendumTimelines = chainReferendums[referendum.referendumId];
      if (!referendumTimelines) {
        referendumTimelines = { onChain: [], offChain: [] };
        chainReferendums[referendum.referendumId] = referendumTimelines;
      }

      referendumTimelines.offChain = result;
    });
  },
  target: $timelines,
});

// on chain

type RequestOnTimelineParams = {
  api: ApiPromise;
  chain: Chain;
  referendum: Referendum;
};

const requestOnChainTimelineFx = createEffect<RequestOnTimelineParams, ReferendumTimelineRecord[]>(
  ({ api, referendum }) => {
    if (referendumService.isOngoing(referendum)) {
      const requests = Promise.all([
        getCreatedDateFromApi(referendum.submitted, api).then(
          (time): ReferendumTimelineRecord => ({
            date: new Date(time),
            status: 'Submitted',
          }),
        ),
        referendum.deciding
          ? getCreatedDateFromApi(referendum.deciding.since, api).then(
              (time): ReferendumTimelineRecord => ({
                date: new Date(time),
                status: 'Deciding',
              }),
            )
          : null,
      ]);

      return requests.then((list) => list.filter(nonNullable));
    }

    return getCreatedDateFromApi(referendum.since, api).then((time) => [
      { date: new Date(time), status: referendumTimelineStatus[referendum.type] },
    ]);
  },
);

sample({
  clock: requestTimeline,
  source: {
    chain: networkSelectorModel.$governanceChain,
    api: networkSelectorModel.$governanceChainApi,
  },
  filter: ({ api, chain }, { referendum }) =>
    nonNullable(api) && nonNullable(chain) && !referendumService.isKilled(referendum),
  fn: ({ api, chain }, { referendum }) => ({
    api: api!,
    chain: chain!,
    referendum,
  }),
  target: requestOnChainTimelineFx,
});

sample({
  clock: requestOnChainTimelineFx.done,
  source: $timelines,
  fn: (timelines, { params: { chain, referendum }, result }) => {
    return produce(timelines, (draft) => {
      let chainReferendums = draft[chain.chainId];
      if (!chainReferendums) {
        chainReferendums = {};
        draft[chain.chainId] = chainReferendums;
      }

      let referendumTimelines = chainReferendums[referendum.referendumId];
      if (!referendumTimelines) {
        referendumTimelines = { onChain: [], offChain: [] };
        chainReferendums[referendum.referendumId] = referendumTimelines;
      }

      referendumTimelines.onChain = result;
    });
  },
  target: $timelines,
});

export const timelineModel = {
  $timelines: readonly($timelines),
  $currentChainTimelines: readonly($currentChainTimelines),
  $isLoading: requestOffChainTimelineFx.pending,

  events: {
    requestTimeline,
  },
};
