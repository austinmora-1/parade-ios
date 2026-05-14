import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { supabase } from '@/integrations/supabase/client';

type Mode = 'signin' | 'signup' | 'forgot';

export default function LoginScreen() {
  const { signIn, signUp, resetPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const clearError = () => setError(null);

  /* ── Email / Password sign-in ── */
  const handleSignIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    clearError();
    try {
      const { error: err } = await signIn(email.trim(), password);
      if (err) setError(err.message);
      // On success, onAuthStateChange fires → AuthProvider updates user →
      // (auth)/_layout.tsx detects user → redirects to (app)
    } finally {
      setLoading(false);
    }
  };

  /* ── Email / Password sign-up ── */
  const handleSignUp = async () => {
    if (!email.trim() || !password || !displayName.trim()) return;
    setLoading(true);
    clearError();
    try {
      // Check username availability
      const { data: available, error: checkErr } = await supabase.rpc(
        'check_username_available',
        { p_username: displayName.trim() }
      );
      if (checkErr) { setError('Could not verify username. Try again.'); return; }
      if (!available) { setError('That username is taken — try another.'); return; }

      const { error: err } = await signUp(email.trim(), password, displayName.trim());
      if (err) { setError(err.message); return; }

      Alert.alert(
        'Check your email',
        `We sent a confirmation link to ${email.trim()}. Tap it to activate your account.`,
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  /* ── Forgot password ── */
  const handleForgot = async () => {
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    setLoading(true);
    clearError();
    try {
      const { error: err } = await resetPassword(email.trim());
      if (err) { setError(err.message); return; }
      setResetSent(true);
    } finally {
      setLoading(false);
    }
  };

  /* ── Apple Sign-In ── */
  const handleAppleSignIn = async () => {
    clearError();
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { identityToken } = credential;
      if (!identityToken) throw new Error('No identity token from Apple');

      const { error: err } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
      });
      if (err) setError(err.message);
    } catch (e: any) {
      // ERR_REQUEST_CANCELED = user dismissed the sheet, not an error
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        setError(e?.message || 'Apple Sign-In failed. Please try again.');
      }
    }
  };

  /* ── Render helpers ── */
  const title = mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Welcome back';

  return (
    <View className="flex-1 bg-evergreen">
      <SafeAreaView className="flex-1" edges={['top']}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-6 pt-12 pb-16 gap-8"
            keyboardShouldPersistTaps="handled"
          >
            {/* Wordmark */}
            <View className="gap-1">
              <Text style={{ fontFamily: 'CormorantGaramond_500Medium' }} className="text-6xl text-chalk">
                Parade<Text className="text-marigold">.</Text>
              </Text>
              <Text className="font-sans text-sage text-base">Plans worth keeping.</Text>
            </View>

            {/* Form card */}
            <View className="bg-chalk/10 rounded-3xl p-6 gap-5">
              <Text className="font-sans font-semibold text-chalk text-xl">{title}</Text>

              {/* Forgot-password success */}
              {mode === 'forgot' && resetSent ? (
                <View className="gap-4">
                  <Text className="font-sans text-chalk/80 text-sm leading-relaxed">
                    Check your inbox — we sent a reset link to{' '}
                    <Text className="text-marigold">{email.trim()}</Text>.
                  </Text>
                  <Pressable onPress={() => { setMode('signin'); setResetSent(false); }}>
                    <Text className="font-sans text-marigold text-sm">← Back to sign in</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Inputs */}
                  <View className="gap-4">
                    {mode === 'signup' && (
                      <Input
                        label="Display name"
                        placeholder="how friends see you"
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={displayName}
                        onChangeText={(t) => { setDisplayName(t); clearError(); }}
                        className="bg-chalk/10 border-chalk/20 text-chalk"
                      />
                    )}
                    <Input
                      label="Email"
                      placeholder="you@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      value={email}
                      onChangeText={(t) => { setEmail(t); clearError(); }}
                      className="bg-chalk/10 border-chalk/20 text-chalk"
                    />
                    {mode !== 'forgot' && (
                      <Input
                        label="Password"
                        placeholder="••••••••"
                        secureTextEntry
                        autoCapitalize="none"
                        value={password}
                        onChangeText={(t) => { setPassword(t); clearError(); }}
                        className="bg-chalk/10 border-chalk/20 text-chalk"
                      />
                    )}
                  </View>

                  {/* Error */}
                  {error ? (
                    <Text className="font-sans text-sm text-ember">{error}</Text>
                  ) : null}

                  {/* Primary CTA */}
                  {mode === 'signin' && (
                    <Button
                      label="Sign in"
                      size="lg"
                      loading={loading}
                      disabled={!email.trim() || !password}
                      onPress={handleSignIn}
                      className="w-full"
                    />
                  )}
                  {mode === 'signup' && (
                    <Button
                      label="Create account"
                      size="lg"
                      loading={loading}
                      disabled={!email.trim() || !password || !displayName.trim()}
                      onPress={handleSignUp}
                      className="w-full"
                    />
                  )}
                  {mode === 'forgot' && (
                    <Button
                      label="Send reset link"
                      size="lg"
                      loading={loading}
                      disabled={!email.trim()}
                      onPress={handleForgot}
                      className="w-full"
                    />
                  )}

                  {/* Divider + Apple Sign-In (sign-in / sign-up only) */}
                  {mode !== 'forgot' && (
                    <>
                      <View className="flex-row items-center gap-3">
                        <View className="flex-1 h-px bg-chalk/20" />
                        <Text className="font-sans text-chalk/40 text-xs">or</Text>
                        <View className="flex-1 h-px bg-chalk/20" />
                      </View>
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                        cornerRadius={16}
                        style={{ height: 52 }}
                        onPress={handleAppleSignIn}
                      />
                    </>
                  )}

                  {/* Forgot password link */}
                  {mode === 'signin' && (
                    <Pressable
                      onPress={() => { setMode('forgot'); clearError(); }}
                      className="items-center"
                    >
                      <Text className="font-sans text-sm text-chalk/50">Forgot password?</Text>
                    </Pressable>
                  )}

                  {/* Back link for forgot */}
                  {mode === 'forgot' && (
                    <Pressable
                      onPress={() => { setMode('signin'); clearError(); }}
                      className="items-center"
                    >
                      <Text className="font-sans text-sm text-chalk/50">← Back to sign in</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>

            {/* Toggle sign-in / sign-up */}
            {mode !== 'forgot' && (
              <Pressable
                onPress={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  clearError();
                }}
                className="items-center"
              >
                <Text className="font-sans text-chalk/60 text-sm">
                  {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                  <Text className="text-marigold font-medium">
                    {mode === 'signin' ? 'Sign up' : 'Sign in'}
                  </Text>
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
