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
import { X, Camera, Check, AlertCircle } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIBES = [
  { id: 'social',     label: 'Social',     emoji: '🎉' },
  { id: 'chill',      label: 'Chill',      emoji: '🛋️' },
  { id: 'athletic',   label: 'Athletic',   emoji: '🏃' },
  { id: 'productive', label: 'Productive', emoji: '💼' },
];

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
          <X size={20} color="#2F4F3F" strokeWidth={2} />
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
                        borderColor: '#F8F0E0',
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
                    className="bg-white rounded-xl border border-border/40 px-4 py-3 pr-10 font-sans text-sm text-foreground shadow-sm"
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
                        style={{ backgroundColor: 'rgba(35,116,77,0.15)' }}
                      >
                        <Check size={12} color="#23744D" strokeWidth={2.5} />
                      </View>
                    )}
                    {(usernameState === 'taken' || usernameState === 'invalid') && (
                      <View
                        className="w-5 h-5 rounded-full items-center justify-center"
                        style={{ backgroundColor: 'rgba(212,101,73,0.15)' }}
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
                    className="bg-white rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
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
                    className="bg-white rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
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
                  className="bg-white rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
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
                  className="bg-white rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
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
                          selected ? 'bg-primary border-primary' : 'bg-white border-border/40'
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
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
