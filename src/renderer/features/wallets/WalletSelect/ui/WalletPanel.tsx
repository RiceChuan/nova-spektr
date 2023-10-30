import { Popover } from '@headlessui/react';
import { useUnit } from 'effector-react';
import { ReactNode, useEffect, useState } from 'react';

import { walletSelectModel } from '../model/wallet-select-model';
import { SmallTitleText, SearchInput } from '@renderer/shared/ui';
import { WalletFamily } from '@renderer/shared/core';
import { useI18n } from '@renderer/app/providers';
import { WalletGroup } from './WalletGroup';
import { walletModel } from '@renderer/entities/wallet';

type Props = {
  action?: ReactNode;
  onClose: () => void;
};
export const WalletPanel = ({ action, onClose }: Props) => {
  const { t } = useI18n();

  const activeWallet = useUnit(walletModel.$activeWallet);
  const [initialWallet] = useState(activeWallet);

  useEffect(() => {
    if (activeWallet?.id !== initialWallet?.id) {
      onClose();
    }
  }, [activeWallet]);

  const filteredWalletGroups = useUnit(walletSelectModel.$filteredWalletGroups);

  return (
    <Popover.Panel className="absolute mt-2 z-10 rounded-md bg-token-container-background border border-token-container-border shadow-card-shadow overflow-visible">
      <section className="relative w-[290px] bg-card-background">
        <header className="px-5 py-3 flex items-center justify-between border-b border-divider">
          <SmallTitleText>{t('wallets.title')}</SmallTitleText>
          {action}
        </header>

        <div className="p-2 border-b border-divider">
          <SearchInput placeholder={t('wallets.searchPlaceholder')} onChange={walletSelectModel.events.queryChanged} />
        </div>

        <div className="flex flex-col divide-y divide-divider overflow-y-auto max-h-[530px] px-1">
          {Object.entries(filteredWalletGroups).map(([walletType, wallets]) => {
            if (wallets.length === 0) return null;

            return <WalletGroup key={walletType} type={walletType as WalletFamily} wallets={wallets} />;
          })}
        </div>
      </section>
    </Popover.Panel>
  );
};