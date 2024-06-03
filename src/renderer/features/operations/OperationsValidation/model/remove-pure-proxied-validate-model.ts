import { Store, createEffect, createEvent, sample } from 'effector';
import { ApiPromise } from '@polkadot/api';

import { Asset, Balance, Chain, ID, Transaction } from '@shared/core';
import { getAssetById, toAccountId } from '@shared/lib/utils';
import { balanceModel } from '@entities/balance';
import { AccountStore, SignatoryStore, ValidationResult } from '../types/types';
import { validationUtils } from '../lib/validation-utils';
import { networkModel } from '@entities/network';
import { transactionService } from '@entities/transaction';
import { RemovePureProxiedRules } from '../lib/remove-pure-proxied-rules';

const validationStarted = createEvent<{ id: ID; transaction: Transaction }>();
const txValidated = createEvent<{ id: ID; result: ValidationResult }>();

type ValidateParams = {
  id: ID;
  api: ApiPromise;
  chain: Chain;
  asset: Asset;
  transaction: Transaction;
  balances: Balance[];
};

const validateFx = createEffect(async ({ id, api, chain, asset, transaction, balances }: ValidateParams) => {
  const accountId = toAccountId(transaction.address);
  const fee = await transactionService.getTransactionFee(transaction, api);

  const rules = [
    {
      value: undefined,
      form: {
        chain,
      },
      ...RemovePureProxiedRules.signatory.notEnoughTokens({} as Store<SignatoryStore>),
      source: {
        fee,
        isMultisig: false,
        proxyDeposit: '0',
        multisigDeposit: '0',
        balances,
      } as SignatoryStore,
    },
    {
      value: { accountId },
      form: {
        chain,
      },
      ...RemovePureProxiedRules.account.notEnoughTokens({} as Store<AccountStore>),
      source: {
        fee,
        isMultisig: false,
        proxyDeposit: '0',
        balances,
      } as AccountStore,
    },
  ];

  return { id, result: validationUtils.applyValidationRules(rules) };
});

sample({
  clock: validationStarted,
  source: {
    chains: networkModel.$chains,
    apis: networkModel.$apis,
    balances: balanceModel.$balances,
  },
  filter: ({ apis }, { transaction }) => Boolean(apis[transaction.chainId]),
  fn: ({ apis, chains, balances }, { id, transaction }) => {
    const chain = chains[transaction.chainId];
    const api = apis[transaction.chainId];
    const asset = getAssetById(transaction.args.assetId, chain.assets) || chain.assets[0];

    return {
      id,
      api,
      transaction,
      chain,
      asset,
      balances,
    };
  },
  target: validateFx,
});

sample({
  clock: validateFx.doneData,
  target: txValidated,
});

export const removePureProxiedValidateModel = {
  events: {
    validationStarted,
  },
  output: {
    txValidated,
  },
};