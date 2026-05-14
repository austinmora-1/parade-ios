/**
 * Button — matches PWA button system.
 *   filled    → bg-primary (#23744D parade green), white text
 *   soft      → bg-primary/10, parade-green text (PWA "soft" variant)
 *   outline   → border-2 border-primary, transparent bg
 *   secondary → bg-secondary (#D46549 ember/coral), white text
 *   ghost     → transparent, evergreen text
 */
import { Pressable, Text, ActivityIndicator, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';

type Variant = 'filled' | 'soft' | 'outline' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends PressableProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  label: string;
  className?: string;
  labelClassName?: string;
}

const variantStyles: Record<Variant, { container: string; label: string; spinnerColor: string }> = {
  filled: {
    container:    'bg-primary active:opacity-80',
    label:        'text-white font-semibold',
    spinnerColor: '#FFFFFF',
  },
  soft: {
    container:    'bg-primary/10 active:opacity-70',
    label:        'text-primary font-semibold',
    spinnerColor: '#23744D',
  },
  outline: {
    container:    'border-2 border-primary bg-transparent active:opacity-70',
    label:        'text-primary font-medium',
    spinnerColor: '#23744D',
  },
  secondary: {
    container:    'bg-secondary active:opacity-80',
    label:        'text-white font-semibold',
    spinnerColor: '#FFFFFF',
  },
  ghost: {
    container:    'bg-transparent active:opacity-60',
    label:        'text-evergreen font-medium',
    spinnerColor: '#2F4F3F',
  },
};

const sizeStyles: Record<Size, { container: string; label: string }> = {
  sm: { container: 'h-9  px-4  rounded-xl',  label: 'text-xs' },
  md: { container: 'h-11 px-5  rounded-xl',  label: 'text-sm' },
  lg: { container: 'h-12 px-8  rounded-xl',  label: 'text-base' },
  xl: { container: 'h-14 px-10 rounded-2xl', label: 'text-lg' },
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
  const styles = variantStyles[variant];

  return (
    <Pressable
      disabled={isDisabled}
      className={cn(
        'flex-row items-center justify-center',
        styles.container,
        sizeStyles[size].container,
        isDisabled && 'opacity-50',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={styles.spinnerColor} />
      ) : (
        <Text
          className={cn(
            'font-sans text-center',
            styles.label,
            sizeStyles[size].label,
            labelClassName,
          )}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
