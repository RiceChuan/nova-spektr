import { useUnit } from 'effector-react';
import keyBy from 'lodash/keyBy';
import { memo, useMemo } from 'react';

import wallet_connect_reconnect from '@/shared/assets/video/wallet_connect_reconnect.mp4';
import wallet_connect_reconnect_webm from '@/shared/assets/video/wallet_connect_reconnect.webm';
import { type Chain, type WalletConnectGroup } from '@/shared/core';
import { useI18n } from '@/shared/i18n';
import { type AccountId } from '@/shared/polkadotjs-schemas';
import { Button, FootnoteText, Icon, SmallTitleText } from '@/shared/ui';
import { ChainAccountsList } from '@/shared/ui-entities';
import { networkModel } from '@/entities/network';
import { walletConnectModel } from '@/entities/walletConnect';
import { WalletConnectQrCode } from '@/features/wallet-pairing-wallet-connect';
import { wcDetailsUtils } from '../../lib/utils';
import { wcDetailsModel } from '../../model/wc-details-model';

type AccountItem = [chain: Chain, accountId: AccountId];

type Props = {
  wallet: WalletConnectGroup;
};

export const WalletConnectAccounts = memo(({ wallet }: Props) => {
  const { t } = useI18n();

  const chains = Object.values(useUnit(networkModel.$chains));
  const reconnectStep = useUnit(wcDetailsModel.$reconnectStep);

  const uri = useUnit(walletConnectModel.$uri);

  const accountsList = useMemo(() => {
    const accountsMap = keyBy(wallet.accounts, 'chainId');

    return chains.reduce<AccountItem[]>((acc, chain) => {
      const accountId = accountsMap[chain.chainId]?.accountId;

      if (accountId) {
        acc.push([chain, accountId]);
      }

      return acc;
    }, []);
  }, [wallet, chains]);

  return (
    <>
      {wcDetailsUtils.isNotStarted(reconnectStep, wallet.isConnected) && <ChainAccountsList accounts={accountsList} />}

      {wcDetailsUtils.isReadyToReconnect(reconnectStep, wallet.isConnected) && (
        <div className="mx-auto flex h-[390px] w-[208px] flex-col items-center justify-center">
          <Icon name="document" size={64} className="mb-6 text-icon-default" />
          <SmallTitleText className="mb-2">{t('walletDetails.walletConnect.disconnectedTitle')}</SmallTitleText>
          <FootnoteText className="mb-4 text-text-tertiary" align="center">
            {t('walletDetails.walletConnect.disconnectedDescription')}
          </FootnoteText>
          <Button size="sm" onClick={() => wcDetailsModel.events.confirmReconnectShown()}>
            {t('walletDetails.walletConnect.reconnectButton')}
          </Button>
        </div>
      )}

      {wcDetailsUtils.isReconnecting(reconnectStep) && (
        <div className="flex h-[400px] flex-col items-center justify-center">
          <video className="h-[400px] object-contain" autoPlay loop>
            <source src={wallet_connect_reconnect_webm} type="video/webm" />
            <source src={wallet_connect_reconnect} type="video/mp4" />
          </video>
        </div>
      )}

      {wcDetailsUtils.isRefreshAccounts(reconnectStep) && <WalletConnectQrCode uri={uri} type="walletconnect" />}
    </>
  );
});
