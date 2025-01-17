import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { type PropsWithChildren, type ReactNode, createContext, useContext, useMemo } from 'react';

import { type XOR } from '@/shared/core';
import { cnTw } from '@/shared/lib/utils';
import { Checkbox } from '../Checkbox/Checkbox';
import { ScrollArea } from '../ScrollArea/ScrollArea';
import { Surface } from '../Surface/Surface';
import { useTheme } from '../Theme/useTheme';
import { gridSpaceConverter } from '../_helpers/gridSpaceConverter';

type ContextProps = {
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
  alignOffset?: number;
  width?: 'auto' | 'trigger';
  keepOpen?: boolean;
  testId?: string;
};

const Context = createContext<ContextProps>({});

type ControlledDropdownProps = XOR<{
  open: boolean;
  onToggle: (value: boolean) => void;
}>;

type RootProps = PropsWithChildren<ControlledDropdownProps & ContextProps>;

const Root = ({
  open,
  onToggle,
  side = 'bottom',
  sideOffset = 2,
  align = 'center',
  alignOffset = 0,
  width = 'auto',
  keepOpen = false,
  testId = 'Dropdown',
  children,
}: RootProps) => {
  const ctx = useMemo(
    () => ({ side, sideOffset, align, alignOffset, width, keepOpen, testId }),
    [side, sideOffset, align, alignOffset, width, keepOpen, testId],
  );

  return (
    <Context.Provider value={ctx}>
      <DropdownMenu.Root modal open={open} onOpenChange={onToggle}>
        {children}
      </DropdownMenu.Root>
    </Context.Provider>
  );
};

const Trigger = ({ children }: PropsWithChildren) => {
  return <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>;
};

const Separator = () => {
  return (
    <DropdownMenu.Separator className="h-[1px] w-full px-2">
      <div className="h-full w-full bg-divider" />
    </DropdownMenu.Separator>
  );
};

const Content = ({ children }: PropsWithChildren) => {
  const { portalContainer } = useTheme();
  const { side, sideOffset, align, alignOffset, width, testId } = useContext(Context);

  const calculatedWidth = width === 'trigger' ? 'var(--radix-dropdown-menu-trigger-width)' : undefined;

  return (
    <DropdownMenu.Portal container={portalContainer}>
      <DropdownMenu.Content
        loop
        asChild
        avoidCollisions={false}
        side={side}
        align={align}
        style={{ width: calculatedWidth }}
        collisionPadding={gridSpaceConverter(2)}
        alignOffset={alignOffset && gridSpaceConverter(alignOffset)}
        sideOffset={sideOffset && gridSpaceConverter(sideOffset)}
        data-testid={testId}
      >
        <Surface
          elevation={1}
          className={cnTw(
            'z-50 flex flex-col',
            'h-max max-h-[--radix-popper-available-height] min-w-20',
            'overflow-hidden duration-100 animate-in fade-in zoom-in-95',
            {
              'max-w-60': width === 'auto',
            },
          )}
        >
          <ScrollArea>
            <div className="flex flex-col gap-y-1 p-1">{children}</div>
          </ScrollArea>
        </Surface>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
};

type GroupProps = PropsWithChildren<{
  label?: ReactNode;
}>;

const Group = ({ label, children }: GroupProps) => {
  return (
    <DropdownMenu.Group className="flex flex-col gap-1">
      {label ? (
        <DropdownMenu.Label className="px-3 py-1 text-help-text text-text-secondary">{label}</DropdownMenu.Label>
      ) : null}
      {children}
    </DropdownMenu.Group>
  );
};

type ItemProps = PropsWithChildren<{
  disabled?: boolean;
  onSelect?: VoidFunction;
  onClick?: VoidFunction;
}>;

const Item = ({ onSelect, onClick, disabled, children }: ItemProps) => {
  const { keepOpen } = useContext(Context);

  const callback = keepOpen
    ? (e: Event) => {
        e.preventDefault();
        onSelect?.();
      }
    : onSelect;

  return (
    <DropdownMenu.Item
      className={cnTw(
        'flex items-center gap-2 rounded px-3 py-2 text-footnote text-text-secondary',
        'cursor-pointer bg-block-background-default hover:bg-block-background-hover',
      )}
      disabled={disabled}
      onSelect={callback}
      onClick={onClick}
    >
      {children}
    </DropdownMenu.Item>
  );
};

type CheckboxItemProps = PropsWithChildren<{
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
  onSelect?: VoidFunction;
}>;

const CheckboxItem = ({ checked, onChange, onSelect, disabled, children }: CheckboxItemProps) => {
  const handleSelect = (event: Event) => {
    event.preventDefault();
    onSelect?.();
  };

  return (
    <DropdownMenu.CheckboxItem
      checked={checked}
      className={cnTw(
        'flex items-center gap-2 rounded-md px-3 py-2 text-start text-footnote text-text-secondary',
        'cursor-pointer',
        {
          'bg-selected-background text-text-primary': checked,
          'bg-block-background-default hover:bg-block-background-hover': !checked,
        },
      )}
      disabled={disabled}
      onCheckedChange={onChange}
      onSelect={handleSelect}
    >
      <Checkbox checked={checked} disabled={disabled} />
      {children}
    </DropdownMenu.CheckboxItem>
  );
};

export const Dropdown = Object.assign(Root, {
  Trigger,
  Content,
  Item,
  CheckboxItem,
  Group,
  Separator,
});
