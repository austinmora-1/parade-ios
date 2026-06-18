/**
 * AppErrorBoundary — top-level boundary so a render throw degrades to a
 * friendly retry screen instead of a blank crash. Reports to the single
 * Sentry sink via captureError. Wraps the provider tree in app/_layout.tsx;
 * its fallback depends only on RN + NativeWind + the Button primitive, so it
 * renders even if a provider below it is the thing that threw.
 */
import { Component, type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button } from '@/components/primitives/Button';
import { captureError } from '@/integrations/telemetry';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    captureError(error, {
      source: 'AppErrorBoundary',
      componentStack: info?.componentStack ?? undefined,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View className="flex-1 items-center justify-center bg-chalk px-8">
          <StatusBar style="dark" />
          <Text className="font-display text-2xl text-evergreen text-center mb-2">
            Something went wrong
          </Text>
          <Text className="font-sans text-base text-muted-foreground text-center mb-8">
            The app hit an unexpected error. Try again — if it keeps happening,
            restarting the app usually clears it up.
          </Text>
          <Button label="Try again" onPress={this.reset} className="w-full max-w-xs" />
        </View>
      );
    }
    return this.props.children;
  }
}
