import { useState, useEffect } from 'react';
import { View, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Supabase fires PASSWORD_RECOVERY on onAuthStateChange when the deep-link
  // token is exchanged — that puts a valid session in place so updateUser works.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); return; }
      Alert.alert('Password updated', 'You can now sign in with your new password.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-evergreen">
      <SafeAreaView className="flex-1 px-6 pt-12 gap-8">
        <View className="gap-1">
          <Text style={{ fontFamily: 'CormorantGaramond_500Medium' }} className="text-5xl text-chalk">
            Parade<Text className="text-marigold">.</Text>
          </Text>
          <Text className="font-sans text-sage text-base">Set a new password.</Text>
        </View>

        <View className="bg-chalk/10 rounded-3xl p-6 gap-5">
          <Text className="font-sans font-semibold text-chalk text-xl">New password</Text>

          {!ready ? (
            <Text className="font-sans text-chalk/60 text-sm">
              Waiting for secure link… open this screen from the reset email.
            </Text>
          ) : (
            <>
              <View className="gap-4">
                <Input
                  label="New password"
                  placeholder="at least 8 characters"
                  secureTextEntry
                  autoCapitalize="none"
                  value={password}
                  onChangeText={(t) => { setPassword(t); setError(null); }}
                  className="bg-chalk/10 border-chalk/20 text-chalk"
                />
                <Input
                  label="Confirm password"
                  placeholder="same again"
                  secureTextEntry
                  autoCapitalize="none"
                  value={confirm}
                  onChangeText={(t) => { setConfirm(t); setError(null); }}
                  className="bg-chalk/10 border-chalk/20 text-chalk"
                />
              </View>
              {error ? (
                <Text className="font-sans text-sm text-ember">{error}</Text>
              ) : null}
              <Button
                label="Update password"
                size="lg"
                loading={loading}
                disabled={!password || !confirm}
                onPress={handleReset}
                className="w-full"
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
