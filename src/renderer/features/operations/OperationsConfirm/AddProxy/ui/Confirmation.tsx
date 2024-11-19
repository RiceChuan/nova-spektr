import { useStoreMap, useUnit } from 'effector-react';
import { type ReactNode, useState } from 'react';

import { useI18n } from '@/shared/i18n';
import { toAccountId } from '@/shared/lib/utils';
import { Button, DetailRow, FootnoteText, Icon, Tooltip } from '@/shared/ui';
import { Account, TransactionDetails } from '@/shared/ui-entities';
import { AssetBalance } from '@/entities/asset';
import { SignButton } from '@/entities/operations';
import { AssetFiatBalance } from '@/entities/price';
import { proxyUtils } from '@/entities/proxy';
import { FeeWithLabel, MultisigDepositWithLabel } from '@/entities/transaction';
import { accountUtils, walletModel } from '@/entities/wallet';
import { MultisigExistsAlert } from '../../common/MultisigExistsAlert';
import { confirmModel } from '../model/confirm-model';

type Props = {
  id?: number;
  secondaryActionButton?: ReactNode;
  hideSignButton?: boolean;
  onGoBack?: () => void;
};

export const Confirmation = ({ id = 0, onGoBack, secondaryActionButton, hideSignButton }: Props) => {
  const { t } = useI18n();
  const wallets = useUnit(walletModel.$wallets);

  const confirmStore = useStoreMap({
    store: confirmModel.$confirmStore,
    keys: [id],
    fn: (value, [id]) => value?.[id],
  });

  const initiatorWallet = useStoreMap({
    store: confirmModel.$initiatorWallets,
    keys: [id],
    fn: (value, [id]) => value?.[id],
  });

  const signerWallet = useStoreMap({
    store: confirmModel.$signerWallets,
    keys: [id],
    fn: (value, [id]) => value?.[id],
  });

  const api = useStoreMap({
    store: confirmModel.$apis,
    keys: [confirmStore?.chain?.chainId],
    fn: (value, [chainId]) => value?.[chainId],
  });

  const isMultisigExists = useUnit(confirmModel.$isMultisigExists);

  const [isFeeLoading, setIsFeeLoading] = useState(true);

  if (!confirmStore || !initiatorWallet) {
    return null;
  }

  return (
    <div className="flex w-modal flex-col items-center gap-y-4 px-5 pb-4 pt-4">
      <div className="mb-2 flex flex-col items-center gap-y-3">
        <Icon name="proxyConfirm" size={60} />
      </div>

      <MultisigExistsAlert active={isMultisigExists} />

      <TransactionDetails
        chain={confirmStore.chain}
        wallets={wallets}
        initiator={[confirmStore.account]}
        signatory={confirmStore.signatory}
        proxied={confirmStore.proxiedAccount}
      >
        <DetailRow label={t('proxy.details.grantAccessType')} className="pr-2">
          <FootnoteText>{t(proxyUtils.getProxyTypeName(confirmStore.proxyType))}</FootnoteText>
        </DetailRow>

        <DetailRow label={t('proxy.details.delegateTo')} className="text-text-secondary">
          <Account accountId={toAccountId(confirmStore.delegate)} chain={confirmStore.chain} variant="short" />
        </DetailRow>

        <hr className="w-full border-filter-border pr-2" />

        <DetailRow
          className="text-text-primary"
          label={
            <>
              <Icon className="text-text-tertiary" name="lock" size={12} />
              <FootnoteText className="text-text-tertiary">{t('proxy.proxyDepositLabel')}</FootnoteText>
              <Tooltip content={t('proxy.proxyDepositHint')} offsetPx={-60}>
                <Icon name="info" className="cursor-pointer hover:text-icon-hover" size={16} />
              </Tooltip>
            </>
          }
        >
          <div className="flex flex-col items-end gap-y-0.5">
            <AssetBalance value={confirmStore.proxyDeposit} asset={confirmStore.chain.assets[0]} />
            <AssetFiatBalance asset={confirmStore.chain.assets[0]} amount={confirmStore.proxyDeposit} />
          </div>
        </DetailRow>

        {accountUtils.isMultisigAccount(confirmStore.account) && (
          <MultisigDepositWithLabel
            api={api}
            asset={confirmStore.chain.assets[0]}
            threshold={confirmStore.account.threshold}
          />
        )}

        <FeeWithLabel
          api={api}
          asset={confirmStore.chain.assets[0]}
          transaction={confirmStore.transaction}
          onFeeLoading={setIsFeeLoading}
        />
      </TransactionDetails>

      <div className="mt-3 flex w-full justify-between">
        {onGoBack && (
          <Button variant="text" onClick={onGoBack}>
            {t('operation.goBackButton')}
          </Button>
        )}

        <div className="flex gap-4">
          {secondaryActionButton}
          {!hideSignButton && !isMultisigExists && (
            <SignButton
              isDefault={Boolean(secondaryActionButton)}
              disabled={isFeeLoading}
              type={(signerWallet || initiatorWallet).type}
              onClick={confirmModel.output.formSubmitted}
            />
          )}
        </div>
      </div>
    </div>
  );
};
