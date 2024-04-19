import { WalletType, Wallet_NEW } from '@shared/core';
import { singnatoryUtils } from '../utils';

describe('entities/signatory/lib/utils', () => {
  test('should get signatory wallet', () => {
    const wallets = [
      {
        id: '1',
        name: 'Incorrect wallet',
        accounts: [{ walletId: '1', accountId: '0x02' }],
      },
      {
        id: '2',
        type: WalletType.POLKADOT_VAULT,
        name: 'Correct wallet',
        accounts: [{ walletId: '2', accountId: '0x01' }],
      },
    ] as unknown as Wallet_NEW[];

    const signatory = singnatoryUtils.getSignatoryWallet(wallets, '0x01');

    expect(signatory).toEqual(wallets[1]);
  });
});
