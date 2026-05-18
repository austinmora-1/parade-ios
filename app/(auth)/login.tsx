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
  const subtitle =
    mode === 'signup'
      ? 'Sign up to join your friends on Parade'
      : mode === 'forgot'
      ? "Enter your email and we'll send a reset link."
      : 'Sign in to your Parade account';

  return (
    /* Dark forest background (matches PWA gradient base color #0F1A14) */
    <View className="flex-1" style={{ backgroundColor: '#0F1A14' }}>
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            className="flex-1"
            contentContainerClassName="flex-grow items-center justify-center px-6 py-8 gap-6"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Wordmark ─────────────────────────────────────────────── */}
            <View className="items-center gap-1">
              <Text
                style={{
                  fontFamily: 'BungeeShade_400Regular',
                  fontSize: 36,
                  color: '#23744D',                 // parade green (matches PWA)
                  textShadowColor: 'rgba(0,0,0,0.4)',
                  textShadowOffset: { width: 0, height: 4 },
                  textShadowRadius: 10,
                  letterSpacing: 1,
                }}
              >
                parade
              </Text>
              <Text className="font-sans text-base" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Plans worth keeping.
              </Text>
            </View>

            {/* ── Form card (white on dark bg) ─────────────────────────── */}
            <View
              className="w-full rounded-2xl bg-white p-6 gap-5"
              style={{
                maxWidth: 384,
                shadowColor: '#000000',
                shadowOpacity: 0.35,
                shadowRadius: 28,
                shadowOffset: { width: 0, height: 12 },
                elevation: 12,
              }}
            >
              {/* Title + subtitle */}
              <View className="gap-1">
                <Text className="font-display text-xl text-foreground">{title}</Text>
                <Text className="font-sans text-sm text-muted-foreground">{subtitle}</Text>
              </View>

              {/* Forgot-password success */}
              {mode === 'forgot' && resetSent ? (
                <View className="gap-4">
                  <Text className="font-sans text-sm text-foreground leading-relaxed">
                    Check your inbox — we sent a reset link to{' '}
                    <Text className="text-primary font-semibold">{email.trim()}</Text>.
                  </Text>
                  <Pressable onPress={() => { setMode('signin'); setResetSent(false); }} hitSlop={6}>
                    <Text className="font-sans text-sm text-primary font-semibold">
                      ← Back to sign in
                    </Text>
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
                    />
                    {mode !== 'forgot' && (
                      <Input
                        label="Password"
                        placeholder="••••••••"
                        secureTextEntry
                        autoCapitalize="none"
                        value={password}
                        onChangeText={(t) => { setPassword(t); clearError(); }}
                      />
                    )}
                  </View>

                  {/* Forgot password link (sign-in only) */}
                  {mode === 'signin' && (
                    <Pressable
                      onPress={() => { setMode('forgot'); clearError(); }}
                      hitSlop={6}
                      style={{ marginTop: -4, alignSelf: 'flex-end' }}
                    >
                      <Text className="font-sans text-xs text-primary font-medium">
                        Forgot password?
                      </Text>
                    </Pressable>
                  )}

                  {/* Error */}
                  {error ? (
                    <Text className="font-sans text-sm text-destructive">{error}</Text>
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

                  {/* Apple Sign-In with divider (sign-in / sign-up only) */}
                  {mode !== 'forgot' && (
                    <>
                      <View className="flex-row items-center gap-3">
                        <View className="flex-1 h-px bg-border" />
                        <Text className="font-sans text-muted-foreground text-xs">or</Text>
                        <View className="flex-1 h-px bg-border" />
                      </View>
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        cornerRadius={12}
                        style={{ height: 48 }}
                        onPress={handleAppleSignIn}
                      />
                    </>
                  )}

                  {/* Back link for forgot */}
                  {mode === 'forgot' && (
                    <Pressable
                      onPress={() => { setMode('signin'); clearError(); }}
                      hitSlop={6}
                      className="items-center"
                    >
                      <Text className="font-sans text-sm text-primary font-medium">
                        ← Back to sign in
                      </Text>
                    </Pressable>
                  )}

                  {/* In-card sign-up toggle (matches PWA pattern) */}
                  {mode === 'signup' && (
                    <Pressable
                      onPress={() => { setMode('signin'); clearError(); }}
                      hitSlop={6}
                      className="items-center"
                    >
                      <Text className="font-sans text-xs text-muted-foreground text-center">
                        Already have an account?{' '}
                        <Text className="text-primary font-semibold">Sign in</Text>
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>

            {/* ── Below-card sign-up toggle (sign-in mode only) ────────── */}
            {mode === 'signin' && (
              <Pressable
                onPress={() => { setMode('signup'); clearError(); }}
                hitSlop={6}
              >
                <Text
                  className="font-sans text-sm text-center"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  Don't have an account?{' '}
                  <Text className="text-primary font-medium">Sign up</Text>
                </Text>
              </Pressable>
            )}

            {/* ── Footer legal links ─────────────────────────────────── */}
            <View className="flex-row items-center justify-center gap-3 mt-2">
              <Text
                className="font-sans text-xs underline"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                Privacy Policy
              </Text>
              <Text className="font-sans text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                ·
              </Text>
              <Text
                className="font-sans text-xs underline"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                Terms of Service
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
