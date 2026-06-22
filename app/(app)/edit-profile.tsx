/**
 * Edit Profile — modal-presented screen.
 *
 * Lets the user update:
 *   - Display name (@handle)
 *   - First / Last name
 *   - Bio (500 chars)
 *   - Current vibe
 *   - Avatar (via expo-image-picker → Supabase Storage `avatars` bucket)
 *
 * Reached via "Edit profile" button on the Profile tab.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { X, Camera, Check, AlertCircle, Lock } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { formatPhoneDisplay, toE164 } from '@/lib/phone';
import { TC } from '@/lib/theme';
import { TINT } from '@/lib/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIBES = [
  { id: 'social',     label: 'Social',     emoji: '🎉' },
  { id: 'chill',      label: 'Chill',      emoji: '🛋️' },
  { id: 'athletic',   label: 'Athletic',   emoji: '🏃' },
  { id: 'productive', label: 'Productive', emoji: '💼' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Supabase returns auth.users.phone without the leading "+"; restore it. */
function authPhoneToE164(phone: string | undefined): string | null {
  if (!phone) return null;
  return phone.startsWith('+') ? phone : `+${phone}`;
}

// ─── Profile query ────────────────────────────────────────────────────────────

function useProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'user_id, display_name, first_name, last_name, avatar_url, bio, current_vibe, home_address, neighborhood',
        )
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
      {children}
    </Text>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useProfile(user?.id);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [bio,         setBio]         = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [vibe,        setVibe]        = useState<string | null>(null);
  const [avatarUrl,   setAvatarUrl]   = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // ── Account identity (separate from the profile Save flow) ────────────────
  // Phone is the immutable sign-in identity (read-only). Email can be attached
  // or changed; that's an auth-level action with its own confirmation flow.
  const phoneE164    = authPhoneToE164(user?.phone);
  const phoneDisplay = phoneE164 ? formatPhoneDisplay(phoneE164) : null;
  const pendingEmail = (user as any)?.new_email as string | undefined;

  const [email,       setEmail]       = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [emailError,  setEmailError]  = useState<string | null>(null);

  // One-time phone capture — only offered when the account has no phone yet
  // (e.g. Apple / email sign-ups). Once verified, phone becomes the locked
  // sign-in identity and this flow is no longer shown.
  const [phoneInput,  setPhoneInput]  = useState('');
  const [phoneCode,   setPhoneCode]   = useState('');
  const [phoneStage,  setPhoneStage]  = useState<'enter' | 'verify'>('enter');
  const [phoneSentTo, setPhoneSentTo] = useState('');
  const [phoneBusy,   setPhoneBusy]   = useState(false);
  const [phoneErr,    setPhoneErr]    = useState<string | null>(null);

  // Keep the email field in sync with the (verified) auth email.
  useEffect(() => { setEmail(user?.email ?? ''); }, [user?.email]);

  // Self-heal: attach the verified sign-in phone to the profile row if it's
  // missing (onboarding mirrors it, but accounts created before that won't
  // have it). Phone is immutable, so only fill when null — never overwrite.
  useEffect(() => {
    if (!user?.id || !phoneE164) return;
    void supabase
      .from('profiles')
      .update({ phone_number: phoneE164 })
      .eq('user_id', user.id)
      .is('phone_number', null);
  }, [user?.id, phoneE164]);

  /** Tracks the result of the latest debounced username availability check */
  const [usernameState, setUsernameState] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [initialDisplayName, setInitialDisplayName] = useState('');

  // Initialize form when profile loads
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setInitialDisplayName(profile.display_name ?? '');
    setFirstName(profile.first_name ?? '');
    setLastName(profile.last_name ?? '');
    setBio(profile.bio ?? '');
    setHomeAddress(profile.home_address ?? '');
    setNeighborhood(profile.neighborhood ?? '');
    setVibe(profile.current_vibe ?? null);
    setAvatarUrl(profile.avatar_url ?? null);
  }, [profile]);

  // ── Dirty check — disable Save until something actually changes ─────────
  const isDirty =
    !!profile && (
      (profile.display_name   ?? '') !== displayName  ||
      (profile.first_name     ?? '') !== firstName    ||
      (profile.last_name      ?? '') !== lastName     ||
      (profile.bio            ?? '') !== bio          ||
      (profile.home_address   ?? '') !== homeAddress  ||
      (profile.neighborhood   ?? '') !== neighborhood ||
      (profile.current_vibe   ?? null) !== vibe       ||
      (profile.avatar_url     ?? null) !== avatarUrl
    );

  // ── Debounced username availability check ─────────────────────────────────
  useEffect(() => {
    const trimmed = displayName.trim();

    // If unchanged from server value → idle (no check needed)
    if (trimmed === initialDisplayName) {
      setUsernameState('idle');
      return;
    }
    if (trimmed.length < 2) {
      setUsernameState('invalid');
      return;
    }
    // Lowercase letters/numbers/underscores only
    if (!/^[a-z0-9_]+$/i.test(trimmed)) {
      setUsernameState('invalid');
      return;
    }

    setUsernameState('checking');
    const handle = setTimeout(async () => {
      try {
        const { data: available, error: rpcErr } = await supabase.rpc(
          'check_username_available',
          { p_username: trimmed },
        );
        if (rpcErr) {
          setUsernameState('idle'); // fall back to no badge if RPC fails
          return;
        }
        setUsernameState(available ? 'available' : 'taken');
      } catch {
        setUsernameState('idle');
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [displayName, initialDisplayName]);

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const handlePickAvatar = useCallback(async () => {
    if (!user?.id) return;
    Haptics.selectionAsync();

    // Permission check
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access in Settings to choose a profile photo.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      // Resize + compress to 512x512 JPEG
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );

      // Read as ArrayBuffer for Supabase upload (binary, not base64)
      const response  = await fetch(manipulated.uri);
      const arrayBuf  = await response.arrayBuffer();

      const filename = `${user.id}/${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filename, arrayBuf, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filename);

      // Append a cache-buster timestamp so the new avatar shows immediately
      const cacheBusted = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(cacheBusted);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Avatar upload failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Upload failed',
        err?.message ?? 'Could not upload photo. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  }, [user?.id]);

  // ── Save profile ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }
    if (usernameState === 'taken') {
      setError('That username is taken — try another.');
      return;
    }
    if (usernameState === 'invalid') {
      setError('Letters, numbers, and underscores only (2+ chars).');
      return;
    }
    if (usernameState === 'checking') {
      setError('Hold on, checking that username…');
      return;
    }
    setError(null);
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          display_name:  displayName.trim(),
          first_name:    firstName.trim()    || null,
          last_name:     lastName.trim()     || null,
          bio:           bio.trim()          || null,
          current_vibe:  vibe,
          avatar_url:    avatarUrl,
          home_address:  homeAddress.trim()  || null,
          neighborhood:  neighborhood.trim() || null,
        })
        .eq('user_id', user.id);

      if (updateErr) throw updateErr;

      // Invalidate profile queries everywhere so they refetch with new data
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['friend-dashboard-data'] });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error('Save profile failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Could not save',
        err?.message ?? 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [user?.id, displayName, firstName, lastName, bio, vibe, avatarUrl, homeAddress, neighborhood, queryClient]);

  const canSubmit =
    isDirty &&
    displayName.trim().length > 0 &&
    !saving &&
    !uploading &&
    usernameState !== 'taken' &&
    usernameState !== 'invalid' &&
    usernameState !== 'checking';

  // ── Attach / change email (auth-level, with confirmation link) ────────────
  const trimmedEmail = email.trim().toLowerCase();
  const emailDirty   = trimmedEmail !== (user?.email ?? '').toLowerCase();
  const canSaveEmail = emailDirty && EMAIL_RE.test(trimmedEmail) && !emailSaving;

  const handleSaveEmail = useCallback(async () => {
    const next = email.trim().toLowerCase();
    if (!EMAIL_RE.test(next)) { setEmailError('Enter a valid email address.'); return; }
    if (next === (user?.email ?? '').toLowerCase()) {
      setEmailError("That's already your email.");
      return;
    }
    setEmailSaving(true);
    setEmailError(null);
    setEmailNotice(null);
    try {
      // Sends a confirmation link to the new address. Email is updated
      // server-side once the link is tapped; it reflects here after the
      // session token next refreshes.
      const { error: err } = await supabase.auth.updateUser(
        { email: next },
        { emailRedirectTo: Linking.createURL('/') },
      );
      if (err) { setEmailError(err.message); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEmailNotice(`Confirmation link sent to ${next}. Tap it to verify.`);
    } catch (e: any) {
      setEmailError(e?.message ?? 'Could not update email. Please try again.');
    } finally {
      setEmailSaving(false);
    }
  }, [email, user?.email]);

  // ── One-time phone capture (verified via SMS OTP) ─────────────────────────
  const handleSendPhoneCode = useCallback(async () => {
    const e164 = toE164(phoneInput);
    if (!e164) {
      setPhoneErr('Enter a valid phone number, including country code.');
      return;
    }
    setPhoneBusy(true);
    setPhoneErr(null);
    try {
      // Sends an OTP to the new number (Supabase phone-change flow).
      const { error: err } = await supabase.auth.updateUser({ phone: e164 });
      if (err) { setPhoneErr(err.message); return; }
      setPhoneSentTo(e164);
      setPhoneCode('');
      setPhoneStage('verify');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setPhoneErr(e?.message ?? 'Could not send code. Please try again.');
    } finally {
      setPhoneBusy(false);
    }
  }, [phoneInput]);

  const handleVerifyPhone = useCallback(async () => {
    const token = phoneCode.trim();
    if (token.length < 6) return;
    setPhoneBusy(true);
    setPhoneErr(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        phone: phoneSentTo,
        token,
        type: 'phone_change',
      });
      if (err) { setPhoneErr(err.message); return; }
      // user.phone is now set → onAuthStateChange refreshes the context and the
      // backfill effect mirrors it into profiles.phone_number.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setPhoneErr(e?.message ?? 'Could not verify code. Please try again.');
    } finally {
      setPhoneBusy(false);
    }
  }, [phoneCode, phoneSentTo]);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => {
            if (!isDirty) {
              router.back();
              return;
            }
            Alert.alert(
              'Discard changes?',
              'You have unsaved profile edits.',
              [
                { text: 'Keep editing', style: 'cancel' },
                {
                  text: 'Discard',
                  style: 'destructive',
                  onPress: () => router.back(),
                },
              ],
            );
          }}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">Edit profile</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSubmit}
          hitSlop={6}
          className={`rounded-xl px-3 py-1.5 ${canSubmit ? 'bg-primary' : 'bg-muted'}`}
        >
          <Text
            className={`font-sans text-sm font-semibold ${
              canSubmit ? 'text-white' : 'text-muted-foreground'
            }`}
          >
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-6 gap-5"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {isLoading ? (
            <ActivityIndicator className="mt-12" color="#23744D" />
          ) : (
            <>
              {/* ── Avatar ──────────────────────────────────────────────── */}
              <View className="items-center gap-3">
                <Pressable
                  onPress={handlePickAvatar}
                  disabled={uploading}
                  hitSlop={6}
                  className="active:opacity-70"
                >
                  <View
                    style={{
                      borderWidth: 4,
                      borderColor: '#FFFFFF',
                      borderRadius: 999,
                      shadowColor: '#040A2A',
                      shadowOpacity: 0.10,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 3 },
                    }}
                  >
                    <Avatar
                      url={avatarUrl}
                      firstName={firstName}
                      lastName={lastName}
                      displayName={displayName}
                      size="xl"
                    />
                    {/* Camera overlay */}
                    <View
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        backgroundColor: '#23744D',
                        borderWidth: 3,
                        borderColor: '#FBF9F4',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {uploading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Camera size={14} color="#FFFFFF" strokeWidth={2.2} />
                      )}
                    </View>
                  </View>
                </Pressable>
                <Pressable onPress={handlePickAvatar} disabled={uploading} hitSlop={4}>
                  <Text className="font-sans text-xs font-semibold text-primary">
                    {uploading ? 'Uploading…' : 'Change photo'}
                  </Text>
                </Pressable>
              </View>

              {/* ── Display name ────────────────────────────────────────── */}
              <View>
                <FieldLabel>Display name</FieldLabel>
                <View className="relative">
                  <TextInput
                    value={displayName}
                    onChangeText={(t) => { setDisplayName(t); setError(null); }}
                    placeholder="e.g. austin"
                    placeholderTextColor="#929298"
                    className="bg-card rounded-xl border border-border/40 px-4 py-3 pr-10 font-sans text-sm text-foreground shadow-sm"
                    maxLength={40}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {/* Inline availability badge */}
                  <View
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: 0,
                      bottom: 0,
                      justifyContent: 'center',
                    }}
                  >
                    {usernameState === 'checking' && (
                      <ActivityIndicator size="small" color="#929298" />
                    )}
                    {usernameState === 'available' && (
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{ backgroundColor: TINT.primaryBorder }}
                      >
                        <Check size={12} color="#23744D" strokeWidth={2.5} />
                      </View>
                    )}
                    {(usernameState === 'taken' || usernameState === 'invalid') && (
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{ backgroundColor: TINT.secondaryBorder }}
                      >
                        <AlertCircle size={12} color="#D46549" strokeWidth={2.5} />
                      </View>
                    )}
                  </View>
                </View>

                {/* Status hint text below input */}
                {usernameState === 'taken' && (
                  <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                    "{displayName.trim()}" is taken — try another.
                  </Text>
                )}
                {usernameState === 'invalid' && displayName.trim().length > 0 && (
                  <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                    Letters, numbers, and underscores only (2+ chars).
                  </Text>
                )}
                {usernameState === 'available' && (
                  <Text className="font-sans text-xs text-primary mt-1.5 px-0.5 font-medium">
                    Available — looks good!
                  </Text>
                )}
                {error && !['taken', 'invalid', 'available'].includes(usernameState) && (
                  <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                    {error}
                  </Text>
                )}
                <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
                  How friends see you — appears as @{displayName || 'handle'}
                </Text>
              </View>

              {/* ── First / Last name ──────────────────────────────────── */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <FieldLabel>First name</FieldLabel>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First"
                    placeholderTextColor="#929298"
                    className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                    maxLength={40}
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel>Last name</FieldLabel>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last"
                    placeholderTextColor="#929298"
                    className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                    maxLength={40}
                  />
                </View>
              </View>

              {/* ── Bio ────────────────────────────────────────────────── */}
              <View>
                <View className="flex-row items-center justify-between px-0.5 mb-2">
                  <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Bio
                  </Text>
                  <Text className="font-sans text-[10px] text-muted-foreground/60">
                    {bio.length} / 500
                  </Text>
                </View>
                <TextInput
                  value={bio}
                  onChangeText={setBio}
                  placeholder="A line or two about you"
                  placeholderTextColor="#929298"
                  className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                  maxLength={500}
                  multiline
                  style={{ minHeight: 96, textAlignVertical: 'top' }}
                />
              </View>

              {/* ── Home location ──────────────────────────────────────── */}
              <View>
                <FieldLabel>Home base</FieldLabel>
                <LocationAutocomplete
                  value={homeAddress}
                  onChange={setHomeAddress}
                  placeholder="Where you usually are"
                  types="(cities)"
                />
                <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
                  Friends see this on your profile.
                </Text>
              </View>

              {/* ── Neighborhood ──────────────────────────────────────── */}
              <View>
                <FieldLabel>Neighborhood (optional)</FieldLabel>
                <TextInput
                  value={neighborhood}
                  onChangeText={setNeighborhood}
                  placeholder="e.g. Mission, Williamsburg"
                  placeholderTextColor="#929298"
                  className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                  maxLength={80}
                />
              </View>

              {/* ── Current vibe ──────────────────────────────────────── */}
              <View>
                <FieldLabel>Current vibe</FieldLabel>
                <View className="flex-row flex-wrap gap-2">
                  {VIBES.map((v) => {
                    const selected = vibe === v.id;
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setVibe(selected ? null : v.id);
                        }}
                        className={`rounded-xl px-3 py-2.5 border flex-row items-center gap-1.5 active:opacity-70 ${
                          selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
                        }`}
                      >
                        <Text style={{ fontSize: 14 }}>{v.emoji}</Text>
                        <Text
                          className={`font-sans text-xs font-medium ${
                            selected ? 'text-white' : 'text-foreground'
                          }`}
                        >
                          {v.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {vibe && (
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); setVibe(null); }}
                    className="mt-2 self-start"
                  >
                    <Text className="font-sans text-xs text-muted-foreground underline">
                      Clear vibe
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* ── Account (sign-in identity) ──────────────────────────── */}
              <View className="h-px bg-border/40 mt-1" />
              <View className="gap-0.5">
                <Text className="font-display text-base text-foreground">Account</Text>
                <Text className="font-sans text-[11px] text-muted-foreground">
                  How you sign in. Your phone number can't be changed.
                </Text>
              </View>

              {/* Phone — locked once set; one-time verified capture if missing */}
              <View>
                <FieldLabel>Phone number</FieldLabel>

                {phoneE164 ? (
                  /* Already has a phone → read-only, immutable */
                  <>
                    <View className="flex-row items-center justify-between bg-muted/40 rounded-xl border border-border/40 px-4 py-3">
                      <Text className="font-sans text-sm text-foreground">
                        {phoneDisplay}
                      </Text>
                      <View className="flex-row items-center gap-1">
                        <Lock size={12} color={TC.icon} strokeWidth={2} />
                        <Text className="font-sans text-[11px] text-muted-foreground">
                          Can't change
                        </Text>
                      </View>
                    </View>
                    <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
                      Used to sign in and to help friends find you.
                    </Text>
                  </>
                ) : phoneStage === 'enter' ? (
                  /* No phone yet → enter a number to verify (one-time) */
                  <>
                    <TextInput
                      value={phoneInput}
                      onChangeText={(t) => { setPhoneInput(t); setPhoneErr(null); }}
                      placeholder="+1 (555) 123-4567"
                      placeholderTextColor="#929298"
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      textContentType="telephoneNumber"
                      className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                      maxLength={20}
                    />
                    {phoneErr ? (
                      <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                        {phoneErr}
                      </Text>
                    ) : null}
                    <Pressable
                      onPress={handleSendPhoneCode}
                      disabled={phoneBusy || !phoneInput.trim()}
                      hitSlop={4}
                      className={`mt-2 self-start rounded-xl px-3 py-2 ${
                        !phoneBusy && phoneInput.trim() ? 'bg-primary active:opacity-80' : 'bg-muted'
                      }`}
                    >
                      <Text
                        className={`font-sans text-xs font-semibold ${
                          !phoneBusy && phoneInput.trim() ? 'text-white' : 'text-muted-foreground'
                        }`}
                      >
                        {phoneBusy ? 'Sending…' : 'Send code'}
                      </Text>
                    </Pressable>
                    <Text className="font-sans text-[11px] text-muted-foreground mt-2 px-0.5 leading-relaxed">
                      Add your number once to help friends find you — you can't change it
                      afterward. By tapping "Send code" you agree to receive a one-time SMS
                      verification code; message and data rates may apply. See our{' '}
                      <Text
                        className="text-primary underline"
                        onPress={() => Linking.openURL('https://helloparade.app/privacy')}
                      >
                        Privacy Policy
                      </Text>{' '}
                      and{' '}
                      <Text
                        className="text-primary underline"
                        onPress={() => Linking.openURL('https://helloparade.app/sms-consent')}
                      >
                        SMS Terms
                      </Text>
                      .
                    </Text>
                  </>
                ) : (
                  /* Verify the code we texted */
                  <>
                    <TextInput
                      value={phoneCode}
                      onChangeText={(t) => { setPhoneCode(t.replace(/\D/g, '')); setPhoneErr(null); }}
                      placeholder="123456"
                      placeholderTextColor="#929298"
                      keyboardType="number-pad"
                      autoComplete="sms-otp"
                      textContentType="oneTimeCode"
                      maxLength={6}
                      className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                    />
                    <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
                      Enter the 6-digit code we texted to {formatPhoneDisplay(phoneSentTo)}.
                    </Text>
                    {phoneErr ? (
                      <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                        {phoneErr}
                      </Text>
                    ) : null}
                    <View className="flex-row items-center gap-4 mt-2">
                      <Pressable
                        onPress={handleVerifyPhone}
                        disabled={phoneBusy || phoneCode.trim().length < 6}
                        hitSlop={4}
                        className={`rounded-xl px-3 py-2 ${
                          !phoneBusy && phoneCode.trim().length >= 6 ? 'bg-primary active:opacity-80' : 'bg-muted'
                        }`}
                      >
                        <Text
                          className={`font-sans text-xs font-semibold ${
                            !phoneBusy && phoneCode.trim().length >= 6 ? 'text-white' : 'text-muted-foreground'
                          }`}
                        >
                          {phoneBusy ? 'Verifying…' : 'Verify & save'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { setPhoneStage('enter'); setPhoneCode(''); setPhoneErr(null); }}
                        hitSlop={6}
                      >
                        <Text className="font-sans text-xs text-primary font-medium">
                          ← Change number
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>

              {/* Email — attach / change (auth-level) */}
              <View>
                <FieldLabel>Email</FieldLabel>
                <TextInput
                  value={email}
                  onChangeText={(t) => { setEmail(t); setEmailError(null); setEmailNotice(null); }}
                  placeholder="you@example.com"
                  placeholderTextColor="#929298"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                  maxLength={120}
                />

                {pendingEmail ? (
                  <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
                    Pending confirmation: {pendingEmail}. Tap the link we emailed to finish.
                  </Text>
                ) : null}
                {emailError ? (
                  <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                    {emailError}
                  </Text>
                ) : null}
                {emailNotice ? (
                  <Text className="font-sans text-xs text-primary mt-1.5 px-0.5 font-medium">
                    {emailNotice}
                  </Text>
                ) : null}

                <Pressable
                  onPress={handleSaveEmail}
                  disabled={!canSaveEmail}
                  hitSlop={4}
                  className={`mt-2 self-start rounded-xl px-3 py-2 ${
                    canSaveEmail ? 'bg-primary active:opacity-80' : 'bg-muted'
                  }`}
                >
                  <Text
                    className={`font-sans text-xs font-semibold ${
                      canSaveEmail ? 'text-white' : 'text-muted-foreground'
                    }`}
                  >
                    {emailSaving ? 'Sending…' : user?.email ? 'Update email' : 'Add email'}
                  </Text>
                </Pressable>

                <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
                  {user?.email
                    ? 'Used for account recovery and notifications.'
                    : "Add an email for account recovery and notifications. We'll send a confirmation link."}
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
