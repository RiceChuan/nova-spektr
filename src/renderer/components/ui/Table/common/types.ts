export type IndexKey = string;

export type AnyRecord = {
  [key: string]: any;
};

export const enum SortType {
  ASC = 'asc',
  DESC = 'desc',
  NONE = 'none',
}

export type Alignment = 'left' | 'right';

export type ColumnConfig = {
  dataKey: string;
  align: 'left' | 'right';
  sortType: SortType;
  sortable: boolean;
};

export type SortConfig = Record<string, ColumnConfig>;