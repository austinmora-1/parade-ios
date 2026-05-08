import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async (): Promise<Session | null> => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
}

function useProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export default function Phase0SmokeTest() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const session = useSession();
  const profile = useProfile(session.data?.user.id);

  const onSignIn = async () => {
    setAuthError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) setAuthError(error.message);
    else session.refetch();
  };

  const onSignOut = async () => {
    await supabase.auth.signOut();
    session.refetch();
  };

  return (
    <SafeAreaView className="flex-1 bg-chalk">
      <ScrollView contentContainerClassName="px-6 py-10 gap-6">
        <View>
          <Text className="font-display text-4xl text-evergreen">
            Parade<Text className="text-marigold">.</Text>
          </Text>
          <Text className="font-sans text-sm text-muted-foreground mt-1">
            Phase 0 — boot smoke test
          </Text>
        </View>

        {session.isLoading ? (
          <ActivityIndicator />
        ) : session.data ? (
          <View className="gap-3 rounded-2xl bg-card p-5">
            <Text className="font-sans text-base text-foreground">
              Signed in as {session.data.user.email}
            </Text>
            {profile.isLoading ? (
              <ActivityIndicator />
            ) : profile.error ? (
              <Text className="font-sans text-ember">
                Profile error: {String((profile.error as Error).message)}
              </Text>
            ) : profile.data ? (
              <View className="gap-1">
                <Text className="font-sans text-xs uppercase tracking-wider text-muted-foreground">
                  Profile
                </Text>
                <Text className="font-sans text-foreground">id: {profile.data.id}</Text>
                <Text className="font-sans text-foreground">name: {profile.data.name ?? '—'}</Text>
                <Text className="font-sans text-foreground">email: {profile.data.email ?? '—'}</Text>
              </View>
            ) : (
              <Text className="font-sans text-muted-foreground">
                No profile row found for this user.
              </Text>
            )}
            <Pressable
              onPress={onSignOut}
              className="mt-2 rounded-xl bg-evergreen px-4 py-3"
            >
              <Text className="text-center font-sans text-secondary-foreground">Sign out</Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-3 rounded-2xl bg-card p-5">
            <Text className="font-sans text-base text-foreground">Sign in to verify Supabase connection</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              className="rounded-xl border border-border bg-background px-4 py-3 font-sans text-foreground"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              secureTextEntry
              autoCapitalize="none"
              className="rounded-xl border border-border bg-background px-4 py-3 font-sans text-foreground"
            />
            {authError ? (
              <Text className="font-sans text-sm text-ember">{authError}</Text>
            ) : null}
            <Pressable
              onPress={onSignIn}
              disabled={submitting || !email || !password}
              className="rounded-xl bg-marigold px-4 py-3 disabled:opacity-50"
            >
              <Text className="text-center font-sans font-medium text-primary-foreground">
                {submitting ? 'Signing in…' : 'Sign in'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
