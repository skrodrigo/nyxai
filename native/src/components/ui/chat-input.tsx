import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { forwardRef, useEffect, useState } from "react";
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  type TextInput,
  View,
  useColorScheme,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  Layout,
  useAnimatedKeyboard,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/lib/globalStore";
import { Button } from "./button";
import { ChatTextInput } from "./chat-text-input";

type Props = {
  input: string;
  onChangeText: (text: string) => void;
  onSubmit: (message: string) => void;
  scrollViewRef: React.RefObject<ScrollView | null>;
  focusOnMount?: boolean;
};

interface SelectedImagesProps {
  uris: string[];
  onRemove: (uri: string) => void;
}

interface ImageItemProps {
  uri: string;
  onRemove: (uri: string) => void;
}

const ImageItem = ({ uri, onRemove }: ImageItemProps) => {
  return (
    <Animated.View
      key={uri}
      className="relative"
      entering={FadeIn.delay(150).springify()}
    >
      <Image
        source={{ uri }}
        style={{
          width: 55,
          height: 55,
          borderRadius: 6,
        }}
        resizeMode="cover"
      />
      <Pressable
        onPress={() => onRemove(uri)}
        className="absolute -right-2 -top-2 h-5 w-5 items-center justify-center rounded-full bg-gray-200"
      >
        <Ionicons name="close" size={12} color="black" />
      </Pressable>
    </Animated.View>
  );
};

const SelectedImages = ({ uris, onRemove }: SelectedImagesProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: withTiming(uris.length === 0 ? 0 : 65, {
        duration: 200,
      }),
    };
  }, [uris.length]);

  return (
    <Animated.View
      className="overflow-hidden"
      style={[animatedStyle]}
      entering={FadeIn.delay(150).springify()}
      exiting={FadeOut}
      layout={Layout.springify()}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        className="mb-4 overflow-visible px-4 py-2"
        style={{ minHeight: 65 }}
      >
        <View className="flex-row gap-4">
          {uris.map((uri) => (
            <ImageItem key={uri} uri={uri} onRemove={onRemove} />
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
};

export const ChatInput = forwardRef<TextInput, Props>(
  (
    { input, onChangeText, onSubmit, scrollViewRef, focusOnMount = false },
    ref,
  ) => {
    const { bottom } = useSafeAreaInsets();
    const keyboard = useAnimatedKeyboard();
    const { selectedImageUris, removeImageUri } = useStore();
    const [isMultiline, setIsMultiline] = useState(false);

    useEffect(() => {
      if (focusOnMount) {
        (ref as React.RefObject<TextInput>).current?.focus();
      }
    }, [focusOnMount, ref]);

    useEffect(() => {
      const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
      const willShowSubscription = Keyboard.addListener("keyboardWillShow", () => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });

      return () => {
        showSubscription.remove();
        willShowSubscription.remove();
      };
    }, [scrollViewRef]);

    const animatedStyles = useAnimatedStyle(() => ({
      paddingBottom: withSpring(Math.max(0, keyboard.height.value - bottom), {
        damping: 20,
        stiffness: 200,
      }),
    }));

    const colorScheme = useColorScheme();

    const handleTextChange = (text: string) => {
      onChangeText(text);
      setIsMultiline(text.includes("\n"));
    };

    return (
      <KeyboardAvoidingView>
        <Animated.View style={animatedStyles}>
          <SelectedImages uris={selectedImageUris} onRemove={removeImageUri} />
          <View className={`flex-row gap-4 bg-background px-4 ${isMultiline ? "items-end py-4" : "items-center"}`}>
            <View className={`max-h-32 flex-1 justify-center rounded-3xl bg-muted px-4 ${isMultiline ? "" : "h-12"}`}>
              <ChatTextInput
                ref={ref}
                className="max-h-28 flex-1"
                style={{ 
                  minHeight: isMultiline ? 32 : 40, 
                  maxHeight: 112, 
                  paddingVertical: 0 
                }}
                placeholder="Message"
                multiline
                value={input}
                onChangeText={handleTextChange}
              />
            </View>
            <Button
              size="icon"
              className="rounded-full bg-zinc-950 dark:bg-zinc-50"
              style={{ width: 48, height: 48 }}
              onPress={() => {
                onSubmit(input);
                Keyboard.dismiss();
              }}
            >
              <Ionicons
                name="arrow-up"
                color={colorScheme === "dark" ? "#09090b" : "#fafafa"}
                size={20}
              />
            </Button>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    );
  },
);

ChatInput.displayName = "ChatInput";
