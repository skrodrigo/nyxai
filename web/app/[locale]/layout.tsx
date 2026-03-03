import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '../../i18n/routing'
import { ThemeProvider } from '@/components/common/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

type Props = {
	children: React.ReactNode
	params: Promise<{ locale: string }>
}

export default async function LocaleLayout({ children, params }: Props) {
	const { locale } = await params

	if (!routing.locales.includes(locale as typeof routing.locales[number])) {
		notFound()
	}

	const messages = await getMessages()

	return (
		<NextIntlClientProvider messages={messages}>
			<ThemeProvider
				attribute="class"
				defaultTheme="dark"
				enableSystem
				disableTransitionOnChange
			>
				<TooltipProvider>{children}</TooltipProvider>
				<Toaster />
			</ThemeProvider>
		</NextIntlClientProvider>
	)
}
