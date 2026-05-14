import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';

type Variant = 'filled' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends PressableProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  label: string;
  className?: string;
  labelClassName?: string;
}

const variantStyles: Record<Variant, { container: string; label: string }> = {
  filled: {
    container: 'bg-marigold active:opacity-80',
    label: 'text-evergreen font-semibold',
  },
  outline: {
    container: 'border border-evergreen bg-transparent active:opacity-70',
    label: 'text-evergreen font-medium',
  },
  ghost: {
    container: 'bg-transparent active:opacity-60',
    label: 'text-evergreen font-medium',
  },
};

const sizeStyles: Record<Size, { container: string; label: string }> = {
  sm: { container: 'px-4 py-2 rounded-xl', label: 'text-sm' },
  md: { container: 'px-5 py-3 rounded-2xl', label: 'text-base' },
  lg: { container: 'px-6 py-4 rounded-2xl', label: 'text-lg' },
};

export function Button({
  variant = 'filled',
  size = 'md',
  loading = false,
  label,
  disabled,
  className,
  labelClassName,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      className={cn(
        'flex-row items-center justify-center',
        variantStyles[variant].container,
        sizeStyles[size].container,
        isDisabled && 'opacity-50',
        className
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'filled' ? '#2F4A3E' : '#DDA73A'}
        />
      ) : (
        <Text
          className={cn(
            'font-sans text-center',
            variantStyles[variant].label,
            sizeStyles[size].label,
            labelClassName
          )}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
