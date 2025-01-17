import { combine } from 'effector';

import { combineStores } from './lib/helpers';
import { membersDomainModel } from './model/members/model';
import { membersService } from './model/members/service';
import { referendumDomainModel } from './model/referendum/model';
import { referendumService } from './model/referendum/service';
import { referendumMetaModel } from './model/referendumMeta/model';
import { tracksDomainModel } from './model/tracks/model';
import { tracksService } from './model/tracks/service';
import { votesDomainModel } from './model/votes/model';
import { votingDomainModel } from './model/voting/model';
import { votingService } from './model/voting/service';

const $store = combine(
  {
    members: membersDomainModel.$list,
    referendums: referendumDomainModel.$list,
    referendumMeta: referendumMetaModel.$list,
    tracks: tracksDomainModel.$list,
    maxRank: tracksDomainModel.$maxRank,
    voting: votingDomainModel.$list,
    votes: votesDomainModel.$votes,
  },
  combineStores,
);

export const collectiveDomain = {
  $store,
  members: membersDomainModel,
  tracks: tracksDomainModel,
  referendum: referendumDomainModel,
  referendumMeta: referendumMetaModel,
  voting: votingDomainModel,
  votes: votesDomainModel,

  tracksService,
  membersService,
  referendumService,
  votingService,
};
