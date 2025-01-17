import { useUnit } from 'effector-react';

import { useI18n } from '@/shared/i18n';
import { SearchInput } from '@/shared/ui-kit';
import { filterModel } from '../../model/filter';

export const Search = () => {
  const { t } = useI18n();
  const query = useUnit(filterModel.$query);

  return (
    <SearchInput
      value={query}
      placeholder={t('governance.searchPlaceholder')}
      onChange={filterModel.events.queryChanged}
    />
  );
};
