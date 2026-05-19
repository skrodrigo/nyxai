import BottomSheet, {
	BottomSheetBackdrop,
	BottomSheetTextInput,
	BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import {
	type ComponentProps,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	ActivityIndicator,
	Keyboard,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, G } from "react-native-svg";
import { useColorScheme } from "@/lib/useColorScheme";
import { useAuth } from "@/services/auth/useAuth";

function AppleIcon({ color, size = 20 }: { color: string; size?: number }) {
	return (
		<Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
			<Path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
		</Svg>
	);
}

function GoogleIcon({ size = 20 }: { size?: number }) {
	return (
		<Svg width={size} height={size} viewBox="-0.5 0 48 48">
			<G fill="none" fillRule="evenodd">
				<Path
					d="M9.827 24c0-1.524.254-2.986.705-4.356L2.623 13.604A23.4 23.4 0 0 0 .214 24c0 3.737.867 7.261 2.406 10.388l7.905-6.051A13.8 13.8 0 0 1 9.827 24"
					fill="#FBBC05"
				/>
				<Path
					d="M23.714 10.133c3.311 0 6.302 1.174 8.652 3.094L39.202 6.4C35.036 2.773 29.695.533 23.714.533 14.427.533 6.445 5.844 2.623 13.604l7.91 6.04c1.822-5.532 7.017-9.51 13.181-9.51"
					fill="#EB4335"
				/>
				<Path
					d="M23.714 37.867c-6.165 0-11.36-3.979-13.181-9.51l-7.91 6.038c3.822 7.761 11.804 13.072 21.09 13.072 5.732 0 11.205-2.036 15.312-5.849l-7.507-5.804c-2.118 1.335-4.786 2.053-7.804 2.053"
					fill="#34A853"
				/>
				<Path
					d="M46.145 24c0-1.387-.213-2.88-.534-4.267H23.714V28.8h12.604c-.63 3.091-2.346 5.468-4.8 7.014l7.507 5.804c4.314-3.994 7.12-9.969 7.12-17.618"
					fill="#4285F4"
				/>
			</G>
		</Svg>
	);
}

interface LoginSheetProps {
	visible: boolean;
	onClose: () => void;
	onSwitchToRegister: () => void;
}

type Step = "methods" | "email";

export function LoginSheet({
	visible,
	onClose,
	onSwitchToRegister,
}: LoginSheetProps) {
	const [step, setStep] = useState<Step>("methods");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [otpCode, setOtpCode] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const bottomSheetRef = useRef<BottomSheet>(null);
	const emailInputRef = useRef<any>(null);
	const { top } = useSafeAreaInsets();
	const { isDarkColorScheme } = useColorScheme();
	const { signIn, verifyOtp, pendingVerification, isLoading, isAuthenticated } =
		useAuth();
	const snapPoints = useMemo(() => ["45%", "95%"], []);

	const isOtpStep = pendingVerification?.email === email;

	useEffect(() => {
		if (visible && isAuthenticated) {
			handleClose();
		}
	}, [visible, isAuthenticated]);

	const handleClose = () => {
		Keyboard.dismiss();
		setStep("methods");
		setPassword("");
		setOtpCode("");
		onClose();
	};

	const handleBack = () => {
		Keyboard.dismiss();
		setStep("methods");
		setTimeout(() => {
			bottomSheetRef.current?.snapToIndex(0);
		}, 100);
	};

	const handleEmailPress = () => {
		setStep("email");
		bottomSheetRef.current?.snapToIndex(1);
		setTimeout(() => {
			emailInputRef.current?.focus();
		}, 800);
	};

	const renderBackdrop = useCallback(
		(props: ComponentProps<typeof BottomSheetBackdrop>) => (
			<BottomSheetBackdrop
				{...props}
				appearsOnIndex={0}
				disappearsOnIndex={-1}
				opacity={0.45}
				pressBehavior="close"
			/>
		),
		[],
	);

	if (!visible) return null;

	return (
		<BottomSheet
			ref={bottomSheetRef}
			index={0}
			snapPoints={snapPoints}
			onClose={handleClose}
			enablePanDownToClose
			keyboardBehavior="extend"
			keyboardBlurBehavior="restore"
			android_keyboardInputMode="adjustPan"
			backdropComponent={renderBackdrop}
			topInset={top}
			handleIndicatorStyle={{ display: "none" }}
			backgroundStyle={{
				backgroundColor: isDarkColorScheme ? "#1c1c1e" : "#fafafa",
				borderTopLeftRadius: 32,
				borderTopRightRadius: 32,
				borderWidth: 0.5,
				borderColor: isDarkColorScheme ? "#2e2e2e" : "#e4e4e7",
				overflow: "hidden",
			}}
		>
			<BottomSheetView
				style={{
					flex: 1,
					backgroundColor: "transparent",
					overflow: "hidden",
				}}
			>
				<View
					style={{
						paddingHorizontal: 20,
						paddingTop: 0,
						paddingBottom: 24,
					}}
				>
					<View className="mb-3 flex-row items-center justify-between">
						{step === "email" ? (
							<TouchableOpacity
								className="h-12 w-12 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800"
								onPress={handleBack}
							>
								<Ionicons
									name="chevron-back"
									size={24}
									color={isDarkColorScheme ? "#a1a1aa" : "#52525b"}
								/>
							</TouchableOpacity>
						) : (
							<View className="flex-1">
								<Text className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
									Sign In
								</Text>
							</View>
						)}
						<TouchableOpacity
							className="h-12 w-12 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800"
							onPress={() => bottomSheetRef.current?.close()}
						>
							<Ionicons
								name="close"
								size={26}
								color={isDarkColorScheme ? "#a1a1aa" : "#52525b"}
							/>
						</TouchableOpacity>
					</View>

					{step === "methods" ? (
						<View className="gap-3">
							<TouchableOpacity className="flex-row items-center justify-center gap-3 rounded-full border border-zinc-200 py-4 dark:border-zinc-700">
								<AppleIcon color={isDarkColorScheme ? "#ffffff" : "#000000"} />
								<Text className="font-semibold text-zinc-950 dark:text-zinc-50">
									Continue with Apple
								</Text>
							</TouchableOpacity>

							<TouchableOpacity className="flex-row items-center justify-center gap-3 rounded-full border border-zinc-200 py-4 dark:border-zinc-700">
								<GoogleIcon />
								<Text className="font-semibold text-zinc-950 dark:text-zinc-50">
									Continue with Google
								</Text>
							</TouchableOpacity>

							<TouchableOpacity
								className="flex-row items-center justify-center gap-3 rounded-full border border-zinc-200 py-4 dark:border-zinc-700"
								onPress={handleEmailPress}
							>
								<Ionicons
									name="mail-outline"
									size={20}
									color={isDarkColorScheme ? "#a1a1aa" : "#52525b"}
								/>
								<Text className="font-semibold text-zinc-950 dark:text-zinc-50">
									Continue with Email
								</Text>
							</TouchableOpacity>

							<View className="mt-4 flex-row items-center justify-center gap-1">
								<Text className="text-zinc-600 dark:text-zinc-400">
									Don't have an account?
								</Text>
								<TouchableOpacity
									onPress={() => {
										handleClose();
										requestAnimationFrame(onSwitchToRegister);
									}}
								>
									<Text className="font-medium text-zinc-950 dark:text-zinc-50">
										Sign up
									</Text>
								</TouchableOpacity>
							</View>
						</View>
					) : (
						<View className="gap-2.5">
							<Text className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
								Sign in with Email
							</Text>

							<View>
								<Text className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
									Email
								</Text>
								<BottomSheetTextInput
									ref={emailInputRef}
									className="rounded-2xl bg-zinc-100 px-4 py-4 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
									placeholder="Enter your email"
									placeholderTextColor={
										isDarkColorScheme ? "#71717a" : "#a1a1aa"
									}
									value={email}
									onChangeText={setEmail}
									keyboardType="email-address"
									autoCapitalize="none"
								/>
							</View>

							{isOtpStep ? (
								<View>
									<Text className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
										Verification code
									</Text>
									<BottomSheetTextInput
										className="rounded-2xl bg-zinc-100 px-4 py-4 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
										placeholder="Enter 6-digit code"
										placeholderTextColor={
											isDarkColorScheme ? "#71717a" : "#a1a1aa"
										}
										value={otpCode}
										onChangeText={setOtpCode}
										keyboardType="number-pad"
										maxLength={6}
									/>
								</View>
							) : (
								<View>
									<Text className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
										Password
									</Text>
									<View className="flex-row items-center rounded-2xl bg-zinc-100 px-4 dark:bg-zinc-800">
										<BottomSheetTextInput
											className="flex-1 py-4 text-zinc-950 dark:text-zinc-50"
											placeholder="Enter your password"
											placeholderTextColor={
												isDarkColorScheme ? "#71717a" : "#a1a1aa"
											}
											value={password}
											onChangeText={setPassword}
											secureTextEntry={!showPassword}
										/>
										<TouchableOpacity
											onPress={() => setShowPassword(!showPassword)}
										>
											<Ionicons
												name={showPassword ? "eye-off" : "eye"}
												size={20}
												color={isDarkColorScheme ? "#a1a1aa" : "#52525b"}
											/>
										</TouchableOpacity>
									</View>
								</View>
							)}

							<TouchableOpacity
								className="mt-1 rounded-full bg-zinc-950 py-4 dark:bg-zinc-50"
								onPress={
									isOtpStep
										? async () => verifyOtp(otpCode.trim(), email.trim())
										: async () => signIn({ email: email.trim(), password })
								}
								disabled={isLoading}
							>
								<View className="flex-row items-center justify-center gap-2">
									{isLoading ? (
										<ActivityIndicator
											color={isDarkColorScheme ? "#09090b" : "#fafafa"}
										/>
									) : null}
									<Text className="text-center font-semibold text-zinc-50 dark:text-zinc-950">
										{isOtpStep ? "Verify code" : "Sign In"}
									</Text>
								</View>
							</TouchableOpacity>
						</View>
					)}
				</View>
			</BottomSheetView>
		</BottomSheet>
	);
}
