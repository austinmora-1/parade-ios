/**
 * PlanPhotosSection — post-plan photo gallery for a plan. Participants can
 * upload photos that everyone with access can see.
 *
 * Storage: `plan-photos` bucket, path = <planId>/<timestamp>.jpg
 * DB row in plan_photos table tracks file_path + caption + uploader.
 */
import {
  View,
  Text,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Camera, ImagePlus } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface PlanPhoto {
  id:         string;
  planId:     string;
  filePath:   string;
  caption:    string | null;
  uploadedBy: string;
  createdAt:  Date;
  publicUrl:  string;
}

function publicUrlFor(filePath: string): string {
  const { data } = supabase.storage.from('plan-photos').getPublicUrl(filePath);
  return data.publicUrl;
}

function usePhotos(planId: string) {
  return useQuery({
    enabled: !!planId,
    queryKey: ['plan-photos', planId],
    staleTime: 60_000,
    queryFn: async (): Promise<PlanPhoto[]> => {
      const { data, error } = await (supabase as any)
        .from('plan_photos')
        .select('id, plan_id, file_path, caption, uploaded_by, created_at')
        .eq('plan_id', planId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id:         r.id,
        planId:     r.plan_id,
        filePath:   r.file_path,
        caption:    r.caption,
        uploadedBy: r.uploaded_by,
        createdAt:  new Date(r.created_at),
        publicUrl:  publicUrlFor(r.file_path),
      }));
    },
  });
}

function useUploadPhoto() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { planId: string; uri: string }) => {
      if (!user?.id) throw new Error('Not signed in');

      // Resize + compress to a sane max
      const manipulated = await ImageManipulator.manipulateAsync(
        input.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
      );
      const response = await fetch(manipulated.uri);
      const arrayBuf = await response.arrayBuffer();

      const filePath = `${input.planId}/${user.id}-${Date.now()}.jpg`;

      const { error: upErr } = await supabase.storage
        .from('plan-photos')
        .upload(filePath, arrayBuf, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (upErr) throw upErr;

      const { error: rowErr } = await (supabase as any)
        .from('plan_photos')
        .insert({
          plan_id:     input.planId,
          file_path:   filePath,
          uploaded_by: user.id,
        });
      if (rowErr) throw rowErr;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['plan-photos', vars.planId] });
    },
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const GAP = 6;
const TILE_W = (SCREEN_W - 40 /* px-5 each side */ - GAP * 2) / 3; // 3-up grid

export function PlanPhotosSection({ planId }: { planId: string }) {
  const { data: photos, isLoading } = usePhotos(planId);
  const uploadMut = useUploadPhoto();
  const [picking, setPicking] = useState(false);

  const handleAdd = useCallback(async () => {
    setPicking(true);
    Haptics.selectionAsync();
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo library access in Settings to add a memory.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) return;

      await uploadMut.mutateAsync({ planId, uri: result.assets[0].uri });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Upload photo failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Upload failed', err?.message ?? 'Please try again.');
    } finally {
      setPicking(false);
    }
  }, [planId, uploadMut]);

  const uploading = uploadMut.isPending || picking;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-1">
        <View className="flex-row items-center gap-1.5">
          <Camera size={12} color="#929298" strokeWidth={2} />
          <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Photos {photos && photos.length > 0 ? `(${photos.length})` : ''}
          </Text>
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={uploading}
          hitSlop={6}
          className="flex-row items-center gap-1 active:opacity-60"
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#23744D" />
          ) : (
            <>
              <ImagePlus size={12} color="#23744D" strokeWidth={2.2} />
              <Text className="font-sans text-xs font-semibold text-primary">
                Add photo
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {isLoading ? (
        <View className="bg-white rounded-2xl border border-border/30 px-4 py-5 items-center shadow-sm">
          <ActivityIndicator color="#23744D" />
        </View>
      ) : (photos ?? []).length === 0 ? (
        <Pressable
          onPress={handleAdd}
          disabled={uploading}
          className="bg-white rounded-2xl border border-dashed border-border/40 px-4 py-5 items-center gap-1 active:opacity-70"
        >
          <Text style={{ fontSize: 24 }}>📷</Text>
          <Text className="font-sans text-sm text-muted-foreground">
            No photos yet
          </Text>
          <Text className="font-sans text-xs text-muted-foreground/60 text-center">
            Add a memory from this plan.
          </Text>
        </Pressable>
      ) : (
        <View
          className="flex-row flex-wrap"
          style={{ gap: GAP }}
        >
          {(photos ?? []).map((p) => (
            <View
              key={p.id}
              style={{
                width:  TILE_W,
                height: TILE_W,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: '#DED4C3',
              }}
            >
              <Image
                source={{ uri: p.publicUrl }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
