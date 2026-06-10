import { View, Text, TextInput, Pressable, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  containerClassName?: string;
}

export function Input({
  label,
  error,
  hint,
  className,
  containerClassName,
  secureTextEntry,
  ...rest
}: InputProps) {
  const [hidden, setHidden] = useState(secureTextEntry ?? false);
  const isPassword = secureTextEntry;

  return (
    <View className={cn('gap-1', containerClassName)}>
      {label ? (
        <Text className="font-sans text-sm text-foreground/70">{label}</Text>
      ) : null}
      <View className="relative">
        <TextInput
          secureTextEntry={isPassword ? hidden : false}
          placeholderTextColor="#929298"
          className={cn(
            'font-sans text-base text-foreground bg-background',
            'rounded-2xl border border-border px-4 py-3',
            isPassword && 'pr-12',
            error && 'border-ember',
            className
          )}
          {...rest}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            className="absolute right-4 top-0 bottom-0 justify-center"
            hitSlop={8}
          >
            {hidden ? (
              <EyeOff size={18} color="#929298" />
            ) : (
              <Eye size={18} color="#929298" />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text className="font-sans text-xs text-ember">{error}</Text>
      ) : hint ? (
        <Text className="font-sans text-xs text-foreground/50">{hint}</Text>
      ) : null}
    </View>
  );
}
