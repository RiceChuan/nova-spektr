import { useUnit } from 'effector-react';
import { useEffect, useState } from 'react';

import { type PendingChunkWithAddress, UnlockChunkType } from '@/shared/api/governance';
import { useI18n } from '@/shared/i18n';
import { getSecondsDurationToBlock } from '@/shared/lib/utils';
import { Button, Duration, FootnoteText, Icon, Shimmering } from '@/shared/ui';
import { AssetBalance } from '@/entities/asset';
import { AssetFiatBalance } from '@/entities/price';
import { permissionUtils, walletModel } from '@/entities/wallet';
import { locksModel, networkSelectorModel, unlockModel } from '@/features/governance';
import { unlockAggregate } from '../aggregates/unlock';

export const UnlockInfo = () => {
  const { t } = useI18n();

  const totalLock = useUnit(locksModel.$totalLock);
  const network = useUnit(networkSelectorModel.$network);
  const pendingSchedule = useUnit(unlockAggregate.$pendingSchedule);
  const isLoading = useUnit(unlockAggregate.$isLoading);
  const totalUnlock = useUnit(unlockModel.$totalUnlock);

  if (!network) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-y-1 px-5 pb-4">
      <Icon name="opengovVotingLock" size={60} />
      <AssetBalance className="mt-2 text-large-title" value={totalLock.toString()} asset={network.asset} />
      <AssetFiatBalance className="mb-5" amount={totalLock.toString()} asset={network.asset} />
      {isLoading && <Shimmering width={250} height={20} />}
      {!totalUnlock.isZero() && (
        <div className="mb-3 flex items-center justify-between self-stretch">
          <AssetBalance value={totalUnlock.toString()} asset={network.asset} />
          <FootnoteText className="text-text-positive">{t('governance.locks.unlockable')}</FootnoteText>
        </div>
      )}
      {pendingSchedule.map((lock) => (
        <div
          key={`${lock.amount.toString()}-${lock.type}-${lock.address}`}
          className="mb-3 flex items-center justify-between self-stretch"
        >
          <AssetBalance value={lock.amount.toString()} asset={network.asset} />
          {lock.type === UnlockChunkType.PENDING_DELEGATION && (
            <FootnoteText className="text-text-tertiary">{t('governance.locks.yourDelegation')}</FootnoteText>
          )}
          {lock.type === UnlockChunkType.PENDING_LOCK && <UnlockCountdown lock={lock} />}
        </div>
      ))}
      <ActionsSection />
    </div>
  );
};

const ActionsSection = () => {
  const { t } = useI18n();

  const isUnlockable = useUnit(unlockAggregate.$isUnlockable);
  const activeWallet = useUnit(walletModel.$activeWallet);

  if (!activeWallet || !permissionUtils.canUnlock(activeWallet)) return null;

  return (
    <div className="mt-3 flex items-center self-end">
      <Button type="submit" disabled={!isUnlockable} onClick={() => unlockAggregate.events.unlockFormStarted()}>
        {t('governance.locks.unlock')}
      </Button>
    </div>
  );
};

const UnlockCountdown = ({ lock }: { lock: PendingChunkWithAddress }) => {
  const { t } = useI18n();

  const [countdown, setCountdown] = useState(getSecondsDurationToBlock(lock.timeToBlock || 0));

  useEffect(() => {
    if (countdown === 0) return;

    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [countdown]);

  return (
    <FootnoteText className="text-text-tertiary">
      {t('governance.locks.unlockableIn')} <Duration as="span" className="text-text-tertiary" seconds={countdown} />
    </FootnoteText>
  );
};
