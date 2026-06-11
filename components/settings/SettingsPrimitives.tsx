import { View, Text, Switch } from 'react-native';

// ─── Sub-components ───────────────────────────────────────────────────────────

export function SectionCard({
  children,
  destructive = false,
}: {
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <View
      className={`mx-5 bg-card rounded-xl overflow-hidden shadow-sm ${
        destructive ? 'border border-destructive/20' : 'border border-border/30'
      }`}
    >
      {children}
    </View>
  );
}

export function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border/30">
      {icon}
      <Text className="font-display text-sm text-foreground">{label}</Text>
    </View>
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  isLast,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
}) {
  return (
    <View
      className={`px-4 py-3 flex-row items-center justify-between gap-3 ${
        isLast ? '' : 'border-b border-border/20'
      }`}
    >
      <View className="flex-1">
        <Text className="font-sans text-sm font-medium text-foreground">{title}</Text>
        {subtitle && (
          <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
            {subtitle}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#DED4C3', true: '#23744D' }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#DED4C3"
      />
    </View>
  );
}
