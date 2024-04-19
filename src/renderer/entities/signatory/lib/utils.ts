import { AccountId, Wallet_NEW } from '@shared/core';
import { walletUtils } from '@entities/wallet';

export const singnatoryUtils = {
  getSignatoryWallet,
};

function getSignatoryWallet(wallets: Wallet_NEW[], accountId: AccountId): Wallet_NEW | undefined {
  return wallets.find((wallet) => {
    const hasMatch = wallet.accounts.some((account) => account.accountId === accountId);

    return (
      hasMatch &&
      (walletUtils.isValidSignatory(wallet) || walletUtils.isPolkadotVault(wallet) || walletUtils.isMultiShard(wallet))
    );
  });
}
