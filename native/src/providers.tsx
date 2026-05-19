import type React from "react";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Toaster } from "@/components/sonner";
import { AuthProvider } from "@/services/auth/useAuth";
import NativewindThemeProvider from "./ThemeProvider";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Toaster />
      <AuthProvider>
        <NativewindThemeProvider>
          <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
        </NativewindThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

export default Providers;
