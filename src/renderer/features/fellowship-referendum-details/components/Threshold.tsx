import { BN_MILLION } from '@polkadot/util';
import { useStoreMap } from 'effector-react';
import { memo } from 'react';

import { useI18n } from '@/shared/i18n';
import { nonNullable, nullable } from '@/shared/lib/utils';
import { DetailRow } from '@/shared/ui';
import { Skeleton } from '@/shared/ui-kit';
import { type Referendum } from '@/domains/collectives';
import { thresholdsModel } from '../model/thresholds';

type Props = {
  referendum: Referendum | null;
  pending: boolean;
};

export const Threshold = memo(({ referendum, pending }: Props) => {
  const { t } = useI18n();

  const thresholds = useStoreMap({
    store: thresholdsModel.$thresholds,
    keys: [referendum?.id],
    fn: (thresholds, [id]) => (id ? thresholds[id] : null) ?? null,
  });

  const threshold = nonNullable(thresholds) ? thresholds.support.value.div(BN_MILLION).toNumber() / 10 : 0;

  return (
    <Skeleton active={pending && nullable(referendum)} fullWidth>
      <DetailRow label={t('fellowship.voting.threshold')}>{threshold}%</DetailRow>
    </Skeleton>
  );
});
