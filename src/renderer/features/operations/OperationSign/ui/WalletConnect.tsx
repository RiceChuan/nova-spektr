import { type UnsignedTransaction } from '@substrate/txwrapper-polkadot';
import { useGate, useUnit } from 'effector-react';
import { useEffect, useState } from 'react';

import wallet_connect_confirm from '@/shared/assets/video/wallet_connect_confirm.mp4';
import wallet_connect_confirm_webm from '@/shared/assets/video/wallet_connect_confirm.webm';
import { type HexString } from '@/shared/core';
import { useI18n } from '@/shared/i18n';
import { useCountdown } from '@/shared/lib/hooks';
import { ValidationErrors, createTxMetadata, toAddress, upgradeNonce } from '@/shared/lib/utils';
import { Button, ConfirmModal, Countdown, FootnoteText, SmallTitleText, StatusModal } from '@/shared/ui';
import { Animation } from '@/shared/ui/Animation/Animation';
import { networkModel } from '@/entities/network';
import { transactionService } from '@/entities/transaction';
import { accountUtils, walletModel, walletUtils } from '@/entities/wallet';
import { DEFAULT_POLKADOT_METHODS, walletConnectModel, walletConnectUtils } from '@/entities/walletConnect';
import { WalletConnectQrCode } from '@/features/wallet-pairing-wallet-connect';
import { operationSignUtils } from '../lib/operation-sign-utils';
import { type SigningProps } from '../lib/types';
import { operationSignModel } from '../model/operation-sign-model';
import { signWcModel } from '../model/sign-wc-model';

export const WalletConnect = ({ apis, signingPayloads, validateBalance, onGoBack, onResult }: SigningProps) => {
  const { t } = useI18n();
  const [countdown, resetCountdown] = useCountdown(Object.values(apis));
  const payload = signingPayloads[0];
  const api = apis[payload.chain.chainId];

  const wallets = useUnit(walletModel.$wallets);
  const session = useUnit(walletConnectModel.$session);
  const provider = useUnit(walletConnectModel.$provider);
  const reconnectStep = useUnit(signWcModel.$reconnectStep);
  const isSigningRejected = useUnit(signWcModel.$isSigningRejected);
  const signatures = useUnit(signWcModel.$signatures);
  const isStatusShown = useUnit(signWcModel.$isStatusShown);
  const uri = useUnit(walletConnectModel.$uri);

  const chains = useUnit(networkModel.$chains);

  const [txPayloads, setTxPayloads] = useState<Uint8Array[]>();
  const [unsignedTxs, setUnsignedTxs] = useState<UnsignedTransaction[]>();
  const [validationError, setValidationError] = useState<ValidationErrors>();

  const transaction = payload.transaction;
  const account = payload.signatory || payload.account;

  if (!accountUtils.isWcAccount(account)) {
    throw new Error(`Account is not Wallet Connect account, got ${JSON.stringify(account, null, 2)}`);
  }

  useGate(operationSignModel.SignerGate, account);

  useEffect(() => {
    if (txPayloads || !provider) return;

    const sessions = provider.client.session.getAll();
    const storedAccount = walletUtils.getAccountsBy(wallets, (a) => a.walletId === account.walletId)[0];
    const storedSession = accountUtils.isWcAccount(storedAccount)
      ? sessions.find((s) => s.topic === storedAccount.signingExtras.sessionTopic)
      : null;

    if (storedSession) {
      walletConnectModel.events.sessionUpdated(storedSession);

      setupTransaction().catch(() => console.warn('WalletConnect | setupTransaction() failed'));
    } else {
      signWcModel.events.reconnectModalShown();
    }
  }, [transaction, api]);

  useEffect(() => {
    if (unsignedTxs) {
      signTransaction();
    }
  }, [unsignedTxs]);

  useEffect(() => {
    if (countdown <= 0) {
      setValidationError(ValidationErrors.EXPIRED);
    }
  }, [countdown]);

  useEffect(() => {
    if (signatures) {
      handleSignature(signatures);
    }
  }, [signatures]);

  const setupTransaction = async (): Promise<void> => {
    const resultPayloads = [];
    const resultUnsignedTxs = [];

    try {
      const address = toAddress(account.accountId, { prefix: payload.chain.addressPrefix });
      let metadata = await createTxMetadata(address, apis[payload.chain.chainId]);

      const payloads: ReturnType<typeof transactionService.createPayloadWithMetadata>[] = [];

      for (const { transaction } of signingPayloads) {
        const payload = transactionService.createPayloadWithMetadata(transaction, api, metadata);
        payloads.push(payload);

        resultPayloads.push(payload.payload);
        resultUnsignedTxs.push(payload.unsigned);

        metadata = upgradeNonce(metadata, 1);
      }

      setTxPayloads(resultPayloads);
      setUnsignedTxs(resultUnsignedTxs);

      transactionService.logPayload(payloads);

      if (payload) {
        resetCountdown();
      }
    } catch (error) {
      console.warn(error);
    }
  };

  const reconnect = () => {
    signWcModel.events.reconnectStarted({
      chains: walletConnectUtils.getWalletConnectChains(Object.values(chains)),
      pairing: { topic: account.signingExtras?.pairingTopic },
    });
  };

  const signTransaction = async () => {
    if (!api || !provider || !session || !unsignedTxs) return;

    signWcModel.events.signingStarted(
      unsignedTxs.map(({ metadataRpc: _, ...unsigned }) => ({
        provider,
        payload: {
          // eslint-disable-next-line i18next/no-literal-string
          chainId: walletConnectUtils.getWalletConnectChainId(transaction.chainId),
          topic: session.topic,
          request: {
            method: DEFAULT_POLKADOT_METHODS.POLKADOT_SIGN_TRANSACTION,
            params: {
              address: transaction.address,
              transactionPayload: unsigned,
            },
          },
        },
      })),
    );
  };

  const handleSignature = async (signatures: HexString[]) => {
    let isVerified;
    let balanceValidationError;

    for (const [index, signature] of Object.entries(signatures)) {
      const txPayload = txPayloads && txPayloads[Number(index)];

      isVerified =
        txPayload && transactionService.verifySignature(txPayload, signature as HexString, payload.account.accountId);
      balanceValidationError = validateBalance && (await validateBalance());
    }

    if (isVerified && balanceValidationError) {
      setValidationError(balanceValidationError || ValidationErrors.INVALID_SIGNATURE);
    } else if (txPayloads) {
      onResult(signatures, txPayloads);
    }
  };

  const walletName = session?.peer.metadata.name || t('operation.walletConnect.defaultWalletName');

  const getStatusProps = () => {
    if (operationSignUtils.isReconnectingStep(reconnectStep)) {
      return {
        title: t('operation.walletConnect.reconnect.reconnecting'),
        content: <Animation variant="loading" loop />,
        onClose: () => {
          signWcModel.events.reconnectAborted();
          onGoBack();
        },
      };
    }

    if (operationSignUtils.isConnectedStep(reconnectStep)) {
      return {
        title: t('operation.walletConnect.reconnect.connected'),
        content: <Animation variant="success" />,
        onClose: () => {
          signWcModel.events.reconnectDone();
          setupTransaction();
        },
      };
    }

    if (operationSignUtils.isRejectedStep(reconnectStep)) {
      return {
        title: t('operation.walletConnect.rejected'),
        content: <Animation variant="error" />,
        onClose: () => {
          signWcModel.events.reconnectAborted();
          onGoBack();
        },
      };
    }

    if (operationSignUtils.isFailedStep(reconnectStep)) {
      return {
        title: t('operation.walletConnect.failedTitle'),
        description: t('operation.walletConnect.failedDescription'),
        content: <WalletConnectQrCode uri={uri} type="walletconnect" />,
        className: 'w-[440px]',
        onClose: () => {
          signWcModel.events.reconnectAborted();
          onGoBack();
        },
      };
    }

    if (isSigningRejected) {
      return {
        title: t('operation.walletConnect.rejected'),
        content: <Animation variant="error" />,
        onClose: () => {
          signWcModel.events.reset();
          onGoBack();
        },
      };
    }

    return {
      title: '',
      content: null,
      onClose: () => {},
    };
  };

  return (
    <div className="flex w-[440px] flex-col items-center gap-y-2.5 rounded-b-lg p-4">
      <SmallTitleText>
        {t('operation.walletConnect.signTitle', {
          count: txPayloads?.length || 1,
          walletName,
        })}
      </SmallTitleText>

      <Countdown countdown={txPayloads ? countdown : 0} />

      <div className="relative w-full">
        <video className="h-[240px]" autoPlay loop>
          <source src={wallet_connect_confirm_webm} type="video/webm" />
          <source src={wallet_connect_confirm} type="video/mp4" />
        </video>

        {validationError === ValidationErrors.EXPIRED && (
          <>
            <div className="absolute bottom-0 left-0 right-0 top-0 bg-white opacity-70" />
            <div className="absolute bottom-0 left-0 right-0 top-0 flex flex-col items-center justify-center gap-4">
              <FootnoteText>{t('operation.walletConnect.expiredDescription')}</FootnoteText>
              <Button size="sm" onClick={onGoBack}>
                {t('operation.walletConnect.tryAgainButton')}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="mt-5 flex w-full justify-between">
        <Button variant="text" onClick={onGoBack}>
          {t('operation.goBackButton')}
        </Button>
      </div>

      <ConfirmModal
        panelClass="w-[300px]"
        isOpen={operationSignUtils.isReadyToReconnectStep(reconnectStep)}
        confirmText={t('operation.walletConnect.reconnect.confirmButton')}
        cancelText={t('operation.walletConnect.reconnect.cancelButton')}
        onClose={onGoBack}
        onConfirm={reconnect}
      >
        <SmallTitleText align="center">
          {t('operation.walletConnect.reconnect.title', {
            walletName,
          })}
        </SmallTitleText>
        <FootnoteText className="mt-2 text-text-tertiary" align="center">
          {t('operation.walletConnect.reconnect.description')}
        </FootnoteText>
      </ConfirmModal>

      <StatusModal isOpen={isStatusShown} {...getStatusProps()} />
    </div>
  );
};
