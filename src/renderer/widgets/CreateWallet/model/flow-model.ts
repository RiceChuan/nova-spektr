import { BN } from '@polkadot/util';
import { combine, createEvent, createStore, restore, sample } from 'effector';
import sortBy from 'lodash/sortBy';
import { delay, spread } from 'patronum';

import {
  type Account,
  AccountType,
  ChainType,
  type Contact,
  CryptoType,
  type MultisigAccount,
  type NoID,
  SigningType,
  type Transaction,
  TransactionType,
  WalletType,
  WrapperKind,
} from '@/shared/core';
import {
  SS58_DEFAULT_PREFIX,
  TEST_ACCOUNTS,
  ZERO_BALANCE,
  isStep,
  nonNullable,
  toAccountId,
  toAddress,
  withdrawableAmountBN,
} from '@/shared/lib/utils';
import { balanceModel, balanceUtils } from '@/entities/balance';
import { contactModel } from '@/entities/contact';
import { networkModel, networkUtils } from '@/entities/network';
import { transactionService } from '@/entities/transaction';
import { accountUtils, walletModel, walletUtils } from '@/entities/wallet';
import { signModel } from '@/features/operations/OperationSign/model/sign-model';
import { ExtrinsicResult, submitModel, submitUtils } from '@/features/operations/OperationSubmit';
import { type AddMultisigStore, type FormSubmitEvent, Step } from '../lib/types';

import { confirmModel } from './confirm-model';
import { formModel } from './form-model';
import { signatoryModel } from './signatory-model';
import { walletProviderModel } from './wallet-provider-model';

const stepChanged = createEvent<Step>();
const feeChanged = createEvent<string>();
const multisigDepositChanged = createEvent<string>();
const isFeeLoadingChanged = createEvent<boolean>();
const formSubmitted = createEvent<FormSubmitEvent>();
const flowFinished = createEvent();
const signerSelected = createEvent<Account>();

const walletCreated = createEvent<{
  name: string;
  threshold: number;
}>();
const $step = restore(stepChanged, Step.NAME_NETWORK).reset(flowFinished);
const $fee = restore(feeChanged, ZERO_BALANCE);
const $multisigDeposit = restore(multisigDepositChanged, ZERO_BALANCE);
const $isFeeLoading = restore(isFeeLoadingChanged, true);

const $error = createStore('').reset(flowFinished);
const $wrappedTx = createStore<Transaction | null>(null).reset(flowFinished);
const $coreTx = createStore<Transaction | null>(null).reset(flowFinished);
const $multisigTx = createStore<Transaction | null>(null).reset(flowFinished);
const $addMultisigStore = createStore<AddMultisigStore | null>(null).reset(flowFinished);
const $signer = restore<Account | null>(signerSelected, null).reset(flowFinished);

const $signerWallet = combine({ signer: $signer, wallets: walletModel.$wallets }, ({ signer, wallets }) => {
  return walletUtils.getWalletFilteredAccounts(wallets, {
    accountFn: (a) => a.accountId === signer?.accountId,
    walletFn: (w) => walletUtils.isValidSignatory(w) && w.id === signer?.walletId,
  });
});

// Miscellaneous

const $isChainConnected = combine(
  {
    chainId: formModel.$createMultisigForm.fields.chainId.$value,
    statuses: networkModel.$connectionStatuses,
  },
  ({ chainId, statuses }) => {
    return networkUtils.isConnectedStatus(statuses[chainId]);
  },
);

const $remarkTx = combine(
  {
    chains: networkModel.$chains,
    form: formModel.$createMultisigForm.$values,
    account: $signer,
    isConnected: $isChainConnected,
  },
  ({ chains, form, account, isConnected }): Transaction | undefined => {
    if (!isConnected || !account || !form.threshold) return undefined;

    return {
      chainId: form.chainId,
      address: toAddress(account.accountId, { prefix: chains[form.chainId].addressPrefix }),
      type: TransactionType.REMARK,
      args: {
        remark: 'Multisig created with Nova Spektr',
      },
    };
  },
  { skipVoid: false },
);

const $transaction = combine(
  {
    apis: networkModel.$apis,
    chains: networkModel.$chains,
    chain: formModel.$chain,
    remarkTx: $remarkTx,
    signatories: signatoryModel.$signatories,
    signer: $signer,
    threshold: formModel.$createMultisigForm.fields.threshold.$value,
    multisigAccountId: formModel.$multisigAccountId,
  },
  ({ apis, chain, remarkTx, signatories, signer, threshold, multisigAccountId }) => {
    if (!chain || !remarkTx || !signer) return undefined;

    const signatoriesWrapped = signatories.map((s) => ({
      accountId: toAccountId(s.address),
      address: s.address,
    }));

    return transactionService.getWrappedTransaction({
      api: apis[chain.chainId],
      addressPrefix: chain.addressPrefix,
      transaction: remarkTx,
      txWrappers: [
        {
          kind: WrapperKind.MULTISIG,
          multisigAccount: {
            accountId: multisigAccountId,
            signatories: signatoriesWrapped,
            threshold,
          } as unknown as MultisigAccount,
          signatories: Array.from(signatories.values()).map((s) => ({
            accountId: toAccountId(s.address),
          })) as Account[],
          signer,
        },
      ],
    });
  },
  { skipVoid: false },
);

const $api = combine(
  {
    apis: networkModel.$apis,
    chainId: formModel.$createMultisigForm.fields.chainId.$value,
  },
  ({ apis, chainId }) => {
    return apis[chainId] ?? null;
  },
);

const $isEnoughBalance = combine(
  {
    signer: $signer,
    fee: $fee,
    multisigDeposit: $multisigDeposit,
    balances: balanceModel.$balances,
    chain: formModel.$chain,
  },
  ({ signer, fee, multisigDeposit, balances, chain }) => {
    if (!signer || !fee || !multisigDeposit || !chain) return false;

    const balance = balanceUtils.getBalance(
      balances,
      signer.accountId,
      chain.chainId,
      chain.assets[0].assetId.toString(),
    );

    return new BN(fee).add(new BN(multisigDeposit)).lte(withdrawableAmountBN(balance));
  },
);

const $fakeTx = combine(
  {
    chainId: formModel.$createMultisigForm.fields.chainId.$value,
    isConnected: $isChainConnected,
  },
  ({ isConnected, chainId }): Transaction | undefined => {
    if (!isConnected) return undefined;

    return {
      chainId,
      address: toAddress(TEST_ACCOUNTS[0], { prefix: SS58_DEFAULT_PREFIX }),
      type: TransactionType.MULTISIG_AS_MULTI,
      args: {
        remark: 'Multisig created with Nova Spektr',
      },
    };
  },
  { skipVoid: false },
);

sample({
  clock: formModel.output.formSubmitted,
  fn: () => Step.CONFIRM,
  target: stepChanged,
});

sample({
  clock: submitModel.output.formSubmitted,
  source: {
    name: formModel.$createMultisigForm.fields.name.$value,
    threshold: formModel.$createMultisigForm.fields.threshold.$value,
    signatories: signatoryModel.$signatories,
    chain: formModel.$chain,
    step: $step,
  },
  filter: ({ step, chain }, results) => {
    const isSubmitStep = isStep(Step.SUBMIT, step);
    const isSuccessResult = results.some(({ result }) => submitUtils.isSuccessResult(result));

    return nonNullable(chain) && isSubmitStep && isSuccessResult;
  },
  fn: ({ signatories, chain, name, threshold }) => {
    const sortedSignatories = sortBy(
      Array.from(signatories.values()).map((a) => ({ address: a.address, accountId: toAccountId(a.address) })),
      'accountId',
    );

    const isEthereumChain = networkUtils.isEthereumBased(chain!.options);
    const cryptoType = isEthereumChain ? CryptoType.ETHEREUM : CryptoType.SR25519;
    const accountIds = sortedSignatories.map((s) => s.accountId);
    const accountId = accountUtils.getMultisigAccountId(accountIds, threshold, cryptoType);

    const account: Omit<NoID<MultisigAccount>, 'walletId'> = {
      signatories: sortedSignatories,
      chainId: chain!.chainId,
      name: name.trim(),
      accountId: accountId,
      threshold: threshold,
      creatorAccountId: accountId,
      cryptoType: isEthereumChain ? CryptoType.ETHEREUM : CryptoType.SR25519,
      chainType: isEthereumChain ? ChainType.ETHEREUM : ChainType.SUBSTRATE,
      type: AccountType.MULTISIG,
    };

    return {
      wallet: {
        name,
        type: WalletType.MULTISIG,
        signingType: SigningType.MULTISIG,
      },
      accounts: [account],
      external: false,
    };
  },
  target: walletModel.events.multisigCreated,
});

sample({
  clock: walletModel.events.walletCreationFail,
  filter: ({ params }) => params.wallet.type === WalletType.MULTISIG,
  fn: ({ error }) => error.message,
  target: $error,
});

sample({
  clock: walletModel.events.walletCreatedDone,
  filter: ({ wallet, external }) => wallet.type === WalletType.MULTISIG && !external,
  fn: ({ wallet }) => wallet.id,
  // wallet selection shouldn't be here, but here we are
  target: [walletModel.events.selectWallet, walletProviderModel.events.completed],
});

// Submit

sample({
  clock: formModel.$createMultisigForm.formValidated,
  source: {
    signer: $signer,
    transaction: $transaction,
    fee: $fee,
    multisigDeposit: $multisigDeposit,
  },
  filter: ({ transaction, signer }) => {
    return Boolean(transaction) && Boolean(signer);
  },
  fn: ({ multisigDeposit, signer, transaction, fee }, formData) => {
    return {
      transactions: {
        wrappedTx: transaction!.wrappedTx,
        multisigTx: transaction!.multisigTx,
        coreTx: transaction!.coreTx,
      },
      formData: {
        ...formData,
        signer: signer!,
        fee,
        account: signer,
        multisigDeposit,
      },
    };
  },
  target: formSubmitted,
});

sample({
  clock: formSubmitted,
  fn: ({ transactions, formData }) => ({
    wrappedTx: transactions.wrappedTx,
    multisigTx: transactions.multisigTx || null,
    coreTx: transactions.coreTx,
    store: formData,
  }),
  target: spread({
    wrappedTx: $wrappedTx,
    multisigTx: $multisigTx,
    coreTx: $coreTx,
    store: $addMultisigStore,
  }),
});

sample({
  clock: formSubmitted,
  fn: ({ formData, transactions }) => ({
    event: { ...formData, transaction: transactions.wrappedTx },
    step: Step.CONFIRM,
  }),
  target: spread({
    event: confirmModel.events.formInitiated,
    step: stepChanged,
  }),
});

sample({
  clock: confirmModel.output.formSubmitted,
  source: {
    chain: formModel.$chain,
    wrappedTx: $wrappedTx,
    signer: $signer,
  },
  filter: ({ chain, wrappedTx, signer }) => nonNullable(chain) && nonNullable(wrappedTx) && nonNullable(signer),
  fn: ({ chain, wrappedTx, signer }) => ({
    event: {
      signingPayloads: [
        {
          chain: chain!,
          account: signer!,
          transaction: wrappedTx!,
        },
      ],
    },
    step: Step.SIGN,
  }),
  target: spread({
    event: signModel.events.formInitiated,
    step: stepChanged,
  }),
});

sample({
  clock: signModel.output.formSubmitted,
  source: {
    chain: formModel.$chain,
    coreTx: $coreTx,
    wrappedTx: $wrappedTx,
    multisigTx: $multisigTx,
    signer: $signer,
  },
  filter: ({ chain, coreTx, wrappedTx, signer }) => {
    return nonNullable(chain) && nonNullable(wrappedTx) && nonNullable(coreTx) && nonNullable(signer);
  },
  fn: ({ chain, coreTx, wrappedTx, multisigTx, signer }, signParams) => ({
    event: {
      ...signParams,
      chain: chain!,
      account: signer!,
      coreTxs: [coreTx!],
      wrappedTxs: [wrappedTx!],
      multisigTxs: multisigTx ? [multisigTx] : [],
    },
    step: Step.SUBMIT,
  }),
  target: spread({
    event: submitModel.events.formInitiated,
    step: stepChanged,
  }),
});

sample({
  clock: submitModel.output.formSubmitted,
  source: {
    step: $step,
    hiddenMultisig: formModel.$hiddenMultisig,
  },
  filter: ({ step, hiddenMultisig }, results) => {
    const isSubmitStep = isStep(step, Step.SUBMIT);
    const isNonNullable = nonNullable(hiddenMultisig);
    const isSuccessResult = results[0]?.result === ExtrinsicResult.SUCCESS;

    return isSubmitStep && isNonNullable && isSuccessResult;
  },
  fn: ({ hiddenMultisig }) => hiddenMultisig!.id,
  target: walletModel.events.walletRemoved,
});

sample({
  clock: delay(submitModel.output.formSubmitted, 2000),
  source: $step,
  filter: (step) => isStep(step, Step.SUBMIT),
  target: flowFinished,
});

sample({
  clock: signModel.output.formSubmitted,
  source: {
    signatories: signatoryModel.$signatories,
    contacts: contactModel.$contacts,
  },
  fn: ({ signatories, contacts }) => {
    return signatories
      .slice(1)
      .filter((signatory) => !contacts.some((contact) => contact.accountId === toAccountId(signatory.address)))
      .map(
        ({ address, name }) =>
          ({
            address: address,
            name: name,
            accountId: toAccountId(address),
          }) as Contact,
      );
  },
  target: contactModel.effects.createContactsFx,
});

sample({
  clock: walletModel.events.walletRestoredSuccess,
  target: walletProviderModel.events.completed,
});

sample({
  clock: walletModel.events.walletRestoredSuccess,
  target: flowFinished,
});

sample({
  clock: flowFinished,
  target: formModel.$createMultisigForm.reset,
});

sample({
  clock: delay(flowFinished, 2000),
  fn: () => Step.NAME_NETWORK,
  target: stepChanged,
});

sample({
  clock: delay(flowFinished, 2000),
  target: signatoryModel.$signatories.reinit,
});

export const flowModel = {
  $error,
  $step,
  $fee,
  $fakeTx,
  $api,
  $isFeeLoading,
  $signer,
  $signerWallet,
  $isEnoughBalance,
  events: {
    signerSelected,
    walletCreated,
    stepChanged,
    feeChanged,
    multisigDepositChanged,
    isFeeLoadingChanged,
    //for tests
    formSubmitted,
  },
  output: {
    flowFinished,
  },
};
