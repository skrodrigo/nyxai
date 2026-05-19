import { useState, useRef, useEffect } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	KeyboardAvoidingView,
	Platform,
	Image,
	Keyboard,
	Pressable,
} from "react-native";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useColorScheme } from "@/lib/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
	BottomSheetBackdrop,
	BottomSheetFooter,
	BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useCallback, useMemo } from "react";
import { LoginSheet } from "../components/auth/login-sheet";
import { RegisterSheet } from "@/components/auth/register-sheet";

	export default function Index() {
		const [inputValue, setInputValue] = useState("");
		const [inputContentHeight, setInputContentHeight] = useState(24);
		const [keyboardHeight, setKeyboardHeight] = useState(0);
		const [showLogin, setShowLogin] = useState(false);
	const [showRegister, setShowRegister] = useState(false);
	const [showExpandSheet, setShowExpandSheet] = useState(false);
	const [expandedText, setExpandedText] = useState("");
	const [shouldSnapToFull, setShouldSnapToFull] = useState(false);
	const inputRef = useRef<TextInput>(null);
	const expandInputRef = useRef<TextInput>(null);
	const bottomSheetRef = useRef<BottomSheet>(null);
	const { bottom, top } = useSafeAreaInsets();
	const router = useRouter();
	const { colorScheme, isDarkColorScheme } = useColorScheme();
	const compactControlSize = 44;
	const inputLineHeight = 20;
	const inputVerticalPadding = 24;
	const maxVisibleLines = 5;
	const expandedInputMaxHeight = inputLineHeight * maxVisibleLines + inputVerticalPadding;

	const handleSend = () => {
		if (!inputValue.trim()) return;
		router.push({
			pathname: "/chat",
			params: { message: inputValue },
		});
	};

	const handleExpandSend = () => {
		if (!expandedText.trim()) return;
		setInputValue(expandedText);
		bottomSheetRef.current?.close();
		router.push({
			pathname: "/chat",
			params: { message: expandedText },
		});
	};

	const hasExplicitLineBreak = inputValue.includes("\n");
	const shouldBottomAlignSend =
		hasExplicitLineBreak || inputContentHeight > compactControlSize - inputVerticalPadding + inputLineHeight;
	const lineCount = Math.max(
		1,
		Math.round((Math.max(inputContentHeight, inputLineHeight) + 4) / inputLineHeight),
	);
	const shouldShowExpand = lineCount >= maxVisibleLines;
	const shouldScrollInput = lineCount >= 5;

	useEffect(() => {
		if (shouldSnapToFull && bottomSheetRef.current) {
			bottomSheetRef.current.snapToIndex(0);
			setShouldSnapToFull(false);
		}
	}, [shouldSnapToFull]);

	useEffect(() => {
		const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
		const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

		const showSubscription = Keyboard.addListener(showEvent, (event) => {
			setKeyboardHeight(event.endCoordinates.height);
		});

		const hideSubscription = Keyboard.addListener(hideEvent, () => {
			setKeyboardHeight(0);
		});

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	const snapPoints = useMemo(() => ["100%"], []);

	const renderExpandBackdrop = useCallback(
		(props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
			<BottomSheetBackdrop
				{...props}
				appearsOnIndex={0}
				disappearsOnIndex={-1}
				opacity={0.8}
				pressBehavior="close"
			/>
		),
		[],
	);

	const renderExpandFooter = useCallback(
		(props: React.ComponentProps<typeof BottomSheetFooter>) => (
			<BottomSheetFooter
				{...props}
				bottomInset={Math.max(bottom + 12, keyboardHeight + 12)}
			>
				<View style={{ paddingHorizontal: 20 }} className="items-end">
					<TouchableOpacity
						className={`h-[44px] w-[44px] items-center justify-center rounded-full ${expandedText.trim() ? "bg-zinc-950 dark:bg-zinc-50" : "bg-zinc-300 dark:bg-zinc-700"}`}
						onPress={() => {
							handleExpandSend();
							Keyboard.dismiss();
						}}
						disabled={!expandedText.trim()}
					>
						<Text
							className={`text-2xl font-semibold ${expandedText.trim() ? "text-zinc-50 dark:text-zinc-950" : "text-zinc-500 dark:text-zinc-400"}`}
						>
							↑
						</Text>
					</TouchableOpacity>
				</View>
			</BottomSheetFooter>
		),
		[bottom, expandedText, keyboardHeight],
	);

	return (
		<Pressable
			className="flex-1 bg-white dark:bg-black"
			onPress={() => Keyboard.dismiss()}
		>
			<SafeAreaView className="flex-1" edges={["top", "left", "right"]}>
				<StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

				<View className="flex-row items-center justify-between px-4 py-3">
					<View className="h-10 w-10 items-center justify-center">
						<Image
							source={require("../../assets/logos/logo-white.png")}
							style={{ width: 32, height: 32 }}
							resizeMode="contain"
						/>
					</View>

					<View className="flex-row items-center gap-2">
						<TouchableOpacity
							className="px-4 py-2"
							onPress={() => {
								Keyboard.dismiss();
								setShowRegister(true);
							}}
						>
							<Text className="text-sm font-medium text-black dark:text-white">
								Sign up free
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							className="rounded-full bg-black px-4 py-2 dark:bg-white"
							onPress={() => {
								Keyboard.dismiss();
								setShowLogin(true);
							}}
						>
							<Text className="text-sm font-medium text-white dark:text-black">
								Sign in
							</Text>
						</TouchableOpacity>
					</View>
				</View>

				<View className="flex-1 items-center justify-center px-4">
					<Text className="text-center text-3xl font-semibold text-black dark:text-white">
						What can I help you with?
					</Text>
				</View>
			</SafeAreaView>

			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
				style={{ position: "absolute", bottom, left: 0, right: 0 }}
			>
				<View
					className="relative flex-row gap-2 bg-white px-4 dark:bg-black"
					style={{
						marginBottom: 12,
						alignItems: shouldBottomAlignSend ? "flex-end" : "center",
					}}
				>
					{/* Botão + à esquerda */}
					<TouchableOpacity
						className="shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800"
						style={{ width: compactControlSize, height: compactControlSize }}
					>
						<Ionicons
							name="add"
							size={24}
							color={isDarkColorScheme ? "#a1a1aa" : "#52525b"}
						/>
					</TouchableOpacity>

					{/* Container do textarea */}
					<View
						className="flex-1 rounded-3xl bg-zinc-100 dark:bg-zinc-800"
						style={{
							minHeight: compactControlSize,
							maxHeight: expandedInputMaxHeight,
							justifyContent: shouldBottomAlignSend ? "flex-start" : "center",
						}}
					>
						<TextInput
							ref={inputRef}
							className="text-black dark:text-white"
							style={{
								minHeight: compactControlSize,
								maxHeight: expandedInputMaxHeight,
								fontSize: 16,
								lineHeight: inputLineHeight,
								paddingLeft: 16,
								paddingRight: 56,
								paddingTop: 12,
								paddingBottom: 12,
								textAlignVertical: "top",
							}}
							placeholder="Message..."
							placeholderTextColor={
								colorScheme === "dark" ? "#a1a1aa" : "#71717a"
							}
							value={inputValue}
							onChangeText={setInputValue}
							onContentSizeChange={(event) => {
								setInputContentHeight(event.nativeEvent.contentSize.height);
							}}
							multiline
							scrollEnabled={shouldScrollInput}
						/>
						{shouldShowExpand ? (
							<TouchableOpacity
								style={{
									position: "absolute",
									right: 12,
									top: 12,
									width: 24,
									height: 24,
									alignItems: "center",
									justifyContent: "center",
								}}
								onPress={() => {
									Keyboard.dismiss();
									setExpandedText(inputValue);
									setShowExpandSheet(true);
									setShouldSnapToFull(true);
								}}
							>
								<Ionicons
									name="code-outline"
									size={16}
									color={isDarkColorScheme ? "#71717a" : "#a1a1aa"}
									style={{ transform: [{ rotate: "-45deg" }] }}
								/>
							</TouchableOpacity>
						) : null}
						<View
							pointerEvents="box-none"
							style={{
								position: "absolute",
								right: 4,
								top: shouldBottomAlignSend ? undefined : 0,
								bottom: shouldBottomAlignSend ? 4 : 0,
								height: shouldBottomAlignSend ? undefined : compactControlSize,
								justifyContent: shouldBottomAlignSend ? undefined : "center",
							}}
						>
							<TouchableOpacity
								className={`items-center justify-center rounded-full ${inputValue.trim() ? "bg-zinc-950 dark:bg-zinc-50" : "bg-zinc-300 dark:bg-zinc-700"}`}
								style={{ width: 36, height: 36 }}
								onPress={() => {
									handleSend();
									Keyboard.dismiss();
								}}
								disabled={!inputValue.trim()}
							>
								<Text
									className={`text-xl font-semibold ${inputValue.trim() ? "text-zinc-50 dark:text-zinc-950" : "text-zinc-500 dark:text-zinc-400"}`}
								>
									↑
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			</KeyboardAvoidingView>

			{showExpandSheet && (
				<BottomSheet
					key="expand-sheet"
					ref={bottomSheetRef}
					index={0}
					snapPoints={snapPoints}
					enableDynamicSizing={false}
					onClose={() => setShowExpandSheet(false)}
					enablePanDownToClose
					keyboardBehavior="extend"
					keyboardBlurBehavior="restore"
					android_keyboardInputMode="adjustResize"
					backdropComponent={renderExpandBackdrop}
					footerComponent={renderExpandFooter}
					topInset={top}
					handleIndicatorStyle={{ display: "none" }}
					backgroundStyle={{
						backgroundColor: isDarkColorScheme ? "#1c1c1e" : "#fafafa",
					}}
					onChange={(index) => {
						if (index === -1) {
							Keyboard.dismiss();
						}
					}}
				>
					<BottomSheetView style={{ flex: 1 }}>
						<View
							style={{
								flex: 1,
								paddingHorizontal: 20,
								paddingTop: 0,
							}}
						>
							<View className="mb-4 flex-row items-center justify-end">
								<TouchableOpacity
									className="h-10 w-10 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800"
									onPress={() => {
										Keyboard.dismiss();
										bottomSheetRef.current?.close();
									}}
								>
									<Ionicons
										name="close"
										size={22}
										color={isDarkColorScheme ? "#a1a1aa" : "#52525b"}
									/>
								</TouchableOpacity>
							</View>

							<View className="flex-1 rounded-2xl">
								<TextInput
									ref={expandInputRef}
									className="flex-1 text-lg leading-6 text-zinc-950 dark:text-zinc-50"
									style={{
										paddingBottom: 24,
										textAlignVertical: "top",
									}}
									placeholder="Type your message..."
									placeholderTextColor={
										isDarkColorScheme ? "#71717a" : "#a1a1aa"
									}
									value={expandedText}
									onChangeText={(text) => {
										setExpandedText(text);
										setInputValue(text);
									}}
									multiline
									autoFocus
								/>
							</View>

						</View>
					</BottomSheetView>
				</BottomSheet>
			)}

			<LoginSheet
				visible={showLogin}
				onClose={() => setShowLogin(false)}
				onSwitchToRegister={() => {
					setShowLogin(false);
					setShowRegister(true);
				}}
			/>

			<RegisterSheet
				visible={showRegister}
				onClose={() => setShowRegister(false)}
				onSwitchToLogin={() => {
					setShowRegister(false);
					setShowLogin(true);
				}}
			/>
		</Pressable>
	);
}
