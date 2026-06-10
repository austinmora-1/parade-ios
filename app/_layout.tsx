import '@/global.css';
import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  applyScheme,
  scheduledScheme,
  msUntilNextBoundary,
  type Scheme,
} from '@/lib/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

initTelemetry();
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

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

  // ── Scheduled dark mode: dark 9pm–7am local, light otherwise ──────────
  const [scheme, setScheme] = useState<Scheme>(() => {
    const s = scheduledScheme();
    applyScheme(s); // set before first paint
    return s;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      const s = scheduledScheme();
      applyScheme(s);
      setScheme(s);
      // Re-arm for the next 9pm/7am boundary (+5s slack)
      clearTimeout(timer);
      timer = setTimeout(sync, msUntilNextBoundary() + 5000);
    };
    sync();
    // Recompute when the app returns to the foreground (clock may have
    // crossed a boundary, or the timezone changed while backgrounded).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});
