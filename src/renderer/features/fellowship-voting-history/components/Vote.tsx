import { useStoreMap } from 'effector-react';

import { type Chain } from '@/shared/core';
import { useI18n } from '@/shared/i18n';
import { BodyText } from '@/shared/ui';
import { RankedAccount } from '@/shared/ui-entities';
import { type Vote as VoteType } from '@/domains/collectives';
import { identityModel } from '../model/identity';
import { membersModel } from '../model/members';

type Props = {
  item: VoteType;
  chain: Chain;
};

export const Vote = ({ item, chain }: Props) => {
  const { t } = useI18n();

  const identity = useStoreMap({
    store: identityModel.$identity,
    keys: [item.accountId],
    fn: (identity, [accountId]) => identity[accountId] ?? null,
  });

  const member = useStoreMap({
    store: membersModel.$members,
    keys: [item.accountId],
    fn: (members, [accountId]) => members[accountId] ?? null,
  });

  return (
    <RankedAccount
      rank={member?.rank || 0}
      isActive={member?.isActive || false}
      name={identity?.name}
      accountId={item.accountId}
      chain={chain}
    >
      <BodyText>{t('fellowship.votingHistory.votes', { count: item.votes })}</BodyText>
    </RankedAccount>
  );
};