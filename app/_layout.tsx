import '@/global.css';
import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  applyScheme,
  resolvedScheme,
  msUntilNextBoundary,
  subscribeScheme,
  currentScheme,
  type Scheme,
} from '@/lib/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { Fraunces_900Black } from '@expo-google-fonts/fraunces/900Black';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { BungeeShade_400Regular } from '@expo-google-fonts/bungee-shade/400Regular';
import * as Sentry from '@sentry/react-native';
import { initTelemetry } from '@/integrations/telemetry';
import { AuthProvider } from '@/hooks/useAuth';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';

initTelemetry();
SplashScreen.preventAutoHideAsync().catch(() => {});

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_700Bold,
    Fraunces_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    BungeeShade_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // ── Dark mode: manual override if set, else dark 9pm–7am local ─────────
  const [scheme, setScheme] = useState<Scheme>(() => {
    const s = resolvedScheme();
    applyScheme(s); // set before first paint
    return s;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      applyScheme(resolvedScheme());
      // Re-arm for the next 9pm/7am boundary (+5s slack) — harmless while
      // an override is active, and picks the schedule back up if cleared.
      clearTimeout(timer);
      timer = setTimeout(sync, msUntilNextBoundary() + 5000);
    };
    sync();
    // Recompute when the app returns to the foreground (clock may have
    // crossed a boundary, or the timezone changed while backgrounded).
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    // Re-render (StatusBar style) whenever the scheme flips, including
    // manual toggles from the profile header.
    const unsubscribe = subscribeScheme(() => setScheme(currentScheme()));
    return () => {
      clearTimeout(timer);
      appState.remove();
      unsubscribe();
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ActionSheetProvider>
                <BottomSheetModalProvider>
                  <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                  <Stack screenOptions={{ headerShown: false }} />
                </BottomSheetModalProvider>
              </ActionSheetProvider>
            </AuthProvider>
          </QueryClientProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});
