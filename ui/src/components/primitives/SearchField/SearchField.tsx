import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { TextField, type TextFieldProps } from '../TextField';

export type SearchFieldProps = Omit<TextFieldProps, 'leading'> & {
  icon?: ReactNode;
};

export function SearchField(props: SearchFieldProps) {
  const {
    icon = <Search size={14} />,
    ...rest
  } = props;

  return (
    <TextField leading={icon} {...rest} />
  );
}
