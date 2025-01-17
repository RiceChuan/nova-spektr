import {
  AccountType,
  type Chain,
  ChainOptions,
  CryptoType,
  type FlexibleMultisigAccount,
  type MultisigAccount,
  type NoID,
  SigningType,
} from '@/shared/core';
import { isEthereumAccountId, toAddress } from '@/shared/lib/utils';
import { type AccountId } from '@/shared/polkadotjs-schemas';

export const multisigUtils = {
  isMultisigSupported,
  isFlexibleMultisigSupported,
  buildMultisigAccount,
  buildFlexibleMultisigAccount,
};

function isMultisigSupported(chain: Chain) {
  return chain.options?.includes(ChainOptions.MULTISIG) ?? false;
}

function isFlexibleMultisigSupported(chain: Chain) {
  const options = chain.options ?? [];

  return (
    isMultisigSupported(chain) &&
    (options.includes(ChainOptions.REGULAR_PROXY) || options.includes(ChainOptions.PURE_PROXY))
  );
}

type BuildMultisigParams = {
  threshold: number;
  accountId: AccountId;
  signatories: AccountId[];
  chain: Chain;
};

function buildMultisigAccount({ threshold, accountId, signatories, chain }: BuildMultisigParams) {
  const account: NoID<Omit<MultisigAccount, 'walletId'>> = {
    threshold: threshold,
    accountId: accountId,
    signatories: signatories.map((signatory) => ({
      accountId: signatory,
      address: toAddress(signatory),
    })),
    name: toAddress(accountId, { chunk: 5, prefix: chain.addressPrefix }),
    chainId: chain.chainId,
    cryptoType: isEthereumAccountId(accountId) ? CryptoType.ETHEREUM : CryptoType.SR25519,
    signingType: SigningType.MULTISIG,
    accountType: AccountType.MULTISIG,
    type: 'chain',
  };

  return account;
}

type BuildFlexibleMultisigParams = {
  threshold: number;
  accountId: AccountId;
  signatories: AccountId[];
  chain: Chain;
  proxyAccountId: AccountId;
};

function buildFlexibleMultisigAccount({
  threshold,
  accountId,
  proxyAccountId,
  signatories,
  chain,
}: BuildFlexibleMultisigParams) {
  const account: NoID<Omit<FlexibleMultisigAccount, 'walletId'>> = {
    threshold,
    accountId,
    proxyAccountId,
    signatories: signatories.map((signatory) => ({
      accountId: signatory,
      address: toAddress(signatory),
    })),
    name: toAddress(accountId, { chunk: 5, prefix: chain.addressPrefix }),
    chainId: chain.chainId,
    cryptoType: isEthereumAccountId(accountId) ? CryptoType.ETHEREUM : CryptoType.SR25519,
    signingType: SigningType.MULTISIG,
    accountType: AccountType.FLEXIBLE_MULTISIG,
    type: 'chain',
  };

  return account;
}
