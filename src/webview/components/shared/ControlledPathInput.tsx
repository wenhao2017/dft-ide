import React, { useEffect } from 'react';
import PathInput from './PathInput';
import { useVscodePath } from '../../hooks/useVscodePath';

interface ControlledPathInputProps {
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showOpen?: boolean;
  showSelectFolder?: boolean;
  showSelectFile?: boolean;
  size?: 'small' | 'middle' | 'large';
  showValidation?: boolean;
}

const ControlledPathInput: React.FC<ControlledPathInputProps> = ({
  value,
  onChange,
  ...props
}) => {
  const state = useVscodePath({ defaultValue: value, autoValidate: props.showValidation !== false });

  // 同步外部 value 到内部 state
  useEffect(() => {
    if (value !== undefined && value !== state.value) {
      state.setValue(value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // 同步内部 state 到外部 onChange
  useEffect(() => {
    if (state.value !== value) {
      onChange?.(state.value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.value]);

  return <PathInput state={state} {...props} />;
};

export default ControlledPathInput;
