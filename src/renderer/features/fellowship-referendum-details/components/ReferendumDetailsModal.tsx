import { BN_MILLION } from '@polkadot/util';
import { useGate, useStoreMap, useUnit } from 'effector-react';

import { nonNullable, nullable } from '@/shared/lib/utils';
import { type ReferendumId } from '@/shared/pallet/referenda';
import { DetailRow, HeaderTitleText, Markdown, SmallTitleText } from '@/shared/ui';
import { Box, Modal, Skeleton } from '@/shared/ui-kit';
import { collectiveDomain } from '@/domains/collectives';
import { referendumDetailsModel } from '../model/details';
import { referendumsDetailsFeatureStatus } from '../model/status';
import { thresholdsModel } from '../model/thresholds';

import { Card } from './Card';
import { ProposerName } from './ProposerName';
import { ReferendumVoteChart } from './shared/ReferendumVoteChart';
import { ReferendumVotingStatusBadge } from './shared/ReferendumVotingStatusBadge';

type Props = {
  isOpen: boolean;
  referendumId: ReferendumId;
  onToggle: (open: boolean) => void;
};

export const ReferendumDetailsModal = ({ referendumId, isOpen, onToggle }: Props) => {
  useGate(referendumsDetailsFeatureStatus.gate);
  useGate(referendumDetailsModel.gate, { referendumId });

  const referendum = useUnit(referendumDetailsModel.$referendum);
  const referendumMeta = useUnit(referendumDetailsModel.$referendumMeta);
  const pendingReferendumMeta = useUnit(referendumDetailsModel.$pendingMeta);
  const pendingReferendum = useUnit(referendumDetailsModel.$pending);

  const loadingState = pendingReferendum && nullable(referendum);
  const metaLoadingState = pendingReferendumMeta && nullable(referendumMeta);

  const thresholds = useStoreMap({
    store: thresholdsModel.$thresholds,
    keys: [referendumId],
    fn: (thresholds, [id]) => thresholds[id] ?? null,
  });

  const threshold = nonNullable(thresholds) ? thresholds.support.value.div(BN_MILLION).toNumber() / 10 : 0;

  return (
    <Modal size="xl" height="full" isOpen={isOpen} onToggle={onToggle}>
      <Modal.Title close>{`Referendum #${referendumId}`}</Modal.Title>
      <Modal.Content>
        <div className="flex min-h-full bg-main-app-background">
          <Box direction="row" width="100%" gap={4} padding={[4, 6]} fillContainer wrap>
            <Box width="100%">
              <Card>
                <Box padding={6} gap={4}>
                  <ProposerName />
                  <HeaderTitleText className="text-balance">
                    {metaLoadingState ? <Skeleton height="1lh" width="80%" /> : referendumMeta?.title}
                  </HeaderTitleText>
                  {metaLoadingState ? (
                    <Skeleton height="8lh" width="100%" />
                  ) : (
                    <Markdown>{referendumMeta?.description ?? ''}</Markdown>
                  )}
                </Box>
              </Card>
            </Box>
            <Box width="350px" shrink={0} gap={4}>
              <Card>
                <Box padding={6} gap={6}>
                  <SmallTitleText>{'Voting status'}</SmallTitleText>

                  <ReferendumVotingStatusBadge referendum={referendum} pending={loadingState} />
                  <ReferendumVoteChart referendum={referendum} pending={loadingState} descriptionPosition="bottom" />

                  {nonNullable(referendum) && collectiveDomain.referendumService.isOngoing(referendum) ? (
                    <DetailRow label="Threshold">{threshold}%</DetailRow>
                  ) : null}

                  {loadingState && <Skeleton height="1lh" />}
                </Box>
              </Card>
            </Box>
          </Box>
        </div>
      </Modal.Content>
    </Modal>
  );
};