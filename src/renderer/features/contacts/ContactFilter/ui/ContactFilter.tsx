import { useUnit } from 'effector-react';
import { useEffect } from 'react';

import { useI18n } from '@/shared/i18n';
import { SearchInput } from '@/shared/ui-kit';
import { filterModel } from '../model/contact-filter';

export const ContactFilter = () => {
  const { t } = useI18n();

  const query = useUnit(filterModel.$query);

  useEffect(() => {
    filterModel.events.formInitiated();
  }, []);

  return (
    <SearchInput
      value={query}
      placeholder={t('addressBook.searchPlaceholder')}
      onChange={filterModel.events.queryChanged}
    />
  );
};
