import { useUnit } from 'effector-react';
import { Trans } from 'react-i18next';

import { useI18n } from '@/shared/i18n';
import { nullable, toAddress } from '@/shared/lib/utils';
import { Button, DetailRow, FootnoteText, Icon, SmallTitleText } from '@/shared/ui';
import { Account } from '@/shared/ui-entities';
import { Tooltip } from '@/shared/ui-kit';
import { AssetBalance } from '@/entities/asset';
import { allTracks, votingService } from '@/entities/governance';
import { accountUtils, walletModel } from '@/entities/wallet';
import { delegationModel } from '@/widgets/DelegationModal';
import { editDelegationModel } from '@/widgets/EditDelegationModal';
import { revokeDelegationModel } from '@/widgets/RevokeDelegationModal';
import { delegateDetailsModel } from '../model/delegate-details-model';

export const YourDelegation = () => {
  const { t } = useI18n();

  const activeAccounts = useUnit(delegateDetailsModel.$activeAccounts);
  const uniqueTracks = useUnit(delegateDetailsModel.$uniqueTracks);
  const activeDelegations = useUnit(delegateDetailsModel.$activeDelegations);
  const chain = useUnit(delegateDetailsModel.$chain);
  const wallet = useUnit(walletModel.$activeWallet);

  const isAddAvailable = useUnit(delegateDetailsModel.$isAddAvailable);
  const isEditAvailable = useUnit(delegateDetailsModel.$isEditAvailable);
  const isViewAvailable = useUnit(delegateDetailsModel.$isViewAvailable);
  const isRevokeAvailable = useUnit(delegateDetailsModel.$isRevokeAvailable);
  const delegate = useUnit(delegateDetailsModel.$delegate);

  const accounts =
    wallet?.accounts.filter(
      (account) =>
        chain &&
        accountUtils.isChainAndCryptoMatch(account, chain) &&
        activeAccounts.includes(toAddress(account.accountId, { prefix: chain.addressPrefix })),
    ) ?? [];

  if (nullable(chain)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <SmallTitleText>{t('governance.delegationDetails.yourDelegation')}</SmallTitleText>

      {activeAccounts.length > 0 && (
        <div className="flex flex-col gap-4">
          <DetailRow label={t('governance.addDelegation.accountsLabel', { count: activeAccounts.length })}>
            {accounts.length === 1 ? (
              <div className="overflow-hidden text-text-secondary">
                <Account accountId={accounts?.[0].accountId} chain={chain} variant="short" />
              </div>
            ) : (
              <FootnoteText className="text-text-secondary">{accounts.length}</FootnoteText>
            )}
          </DetailRow>

          <DetailRow label={t('governance.addDelegation.tracksLabel')}>
            <Tooltip side="bottom">
              <Tooltip.Trigger>
                <div className="flex gap-1">
                  <FootnoteText>{uniqueTracks.length}</FootnoteText>

                  <Icon className="group-hover:text-icon-hover" name="info" size={16} />
                </div>
              </Tooltip.Trigger>
              <Tooltip.Content>
                {uniqueTracks
                  .map((trackId) => t(allTracks.find((track) => track.id === trackId)?.value || ''))
                  .join(', ')}
              </Tooltip.Content>
            </Tooltip>
          </DetailRow>

          {activeAccounts.length === 1 && (
            <DetailRow label={t('governance.addDelegation.votesLabel')}>
              <FootnoteText>
                <Trans
                  t={t}
                  i18nKey="governance.addDelegation.votesValue"
                  components={{
                    votes: (
                      <AssetBalance
                        value={votingService.calculateVotingPower(
                          activeDelegations[activeAccounts[0]]?.balance,
                          activeDelegations[activeAccounts[0]]?.conviction,
                        )}
                        asset={chain?.assets[0]}
                        showSymbol={false}
                      />
                    ),
                  }}
                />
              </FootnoteText>
            </DetailRow>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {isAddAvailable && (
          <Button onClick={() => delegate && delegationModel.events.selectDelegate(delegate)}>
            {t('governance.addDelegation.addDelegationButton')}
          </Button>
        )}

        {isEditAvailable && accounts.length === 1 && (
          <Button
            onClick={() => {
              if (delegate) {
                editDelegationModel.events.flowStarted({ delegate, accounts: [accounts[0]] });
              }
            }}
          >
            {t('governance.delegationDetails.editDelegationButton', { count: 1 })}
          </Button>
        )}

        {isRevokeAvailable && accounts.length === 1 && (
          <Button
            pallet="secondary"
            onClick={() => {
              if (delegate) {
                revokeDelegationModel.events.flowStarted({ delegate: delegate.accountId, accounts: [accounts[0]] });
              }
            }}
          >
            {t('governance.addDelegation.revokeDelegationButton')}
          </Button>
        )}

        {isViewAvailable && (
          <Button pallet="secondary" onClick={() => delegateDetailsModel.events.openDelegations()}>
            {t('governance.addDelegation.viewDelegationButton')}
          </Button>
        )}
      </div>
    </div>
  );
};
