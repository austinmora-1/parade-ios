/**
 * Bug-report / feedback submission.
 *
 * Reports are sent to the `report-issue` Supabase Edge Function, which holds
 * the Linear API key server-side and creates an issue in the UXPE team —
 * labelled `bug` or `feedback`. Optional screenshots are uploaded to the
 * `bug-reports` storage bucket and embedded in the issue.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/integrations/supabase/client';

export type ReportType = 'bug' | 'feedback';

export interface ReportContext {
  route?: string;
  appVersion?: string;
  buildNumber?: string;
  osVersion?: string;
}

/** Snapshot the app/device context attached to every report. */
export function collectContext(route?: string): ReportContext {
  const buildNumber =
    (Constants.expoConfig as any)?.ios?.buildNumber ??
    (Constants as any).nativeBuildVersion ??
    undefined;
  return {
    route: route || undefined,
    appVersion: Constants.expoConfig?.version ?? undefined,
    buildNumber: buildNumber ? String(buildNumber) : undefined,
    osVersion: `${Platform.OS} ${Platform.Version}`,
  };
}

/**
 * Upload a screenshot to the `bug-reports` bucket and return its public URL.
 * Returns null (and warns) on any failure so the report can still submit
 * without the image — e.g. before the bucket exists.
 */
export async function uploadScreenshot(
  uri: string,
  userId: string,
): Promise<string | null> {
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    const arrayBuf = await (await fetch(manipulated.uri)).arrayBuffer();
    const filePath = `${userId}/${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from('bug-reports')
      .upload(filePath, arrayBuf, { contentType: 'image/jpeg', upsert: false });
    if (error) {
      console.warn('Screenshot upload failed:', error.message);
      return null;
    }
    return supabase.storage.from('bug-reports').getPublicUrl(filePath).data.publicUrl;
  } catch (err) {
    console.warn('Screenshot upload error:', err);
    return null;
  }
}

export interface SubmitReportInput {
  type: ReportType;
  message: string;
  email?: string | null;
  context: ReportContext;
  screenshotUrl?: string | null;
}

export interface SubmitReportResult {
  /** Linear issue URL, when available. */
  url?: string;
  /** Linear issue identifier, e.g. "UXPE-123". */
  identifier?: string;
}

/** Send a report to the report-issue edge function (creates a Linear issue). */
export async function submitReport(
  input: SubmitReportInput,
): Promise<SubmitReportResult> {
  const { data, error } = await supabase.functions.invoke('report-issue', {
    body: input,
  });
  if (error) throw error;
  return (data as SubmitReportResult) ?? {};
}
