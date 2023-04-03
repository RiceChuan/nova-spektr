import cn from 'classnames';

import { TypographyProps } from '@renderer/components/ui-redesign/Typography/common/types';
import Text from '@renderer/components/ui-redesign/Typography/common/Text';

const CalloutText = ({ className, ...props }: TypographyProps) => (
  <Text className={cn('text-callout', className)} {...props} />
);

export default CalloutText;