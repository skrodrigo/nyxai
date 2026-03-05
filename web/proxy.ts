import { type NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

const PUBLIC_PATHS = ['/login', '/register', '/api/auth']

function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATHS.some((path) => pathname.startsWith(path))
}

function getLocaleFromPath(pathname: string): string {
	const localeMatch = pathname.match(/^\/(en|fr|es|pt)(\/|$)/)
	return localeMatch ? localeMatch[1] : routing.defaultLocale
}

function isRootOrLocaleOnly(pathname: string, locale: string): boolean {
	return pathname === '/' || pathname === `/${locale}` || pathname === `/${locale}/`
}

function isStaticAsset(pathname: string): boolean {
	return /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|json|woff2?|ttf|otf|eot)$/i.test(pathname)
}

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl

	if (pathname.startsWith('/ping')) {
		return new Response('pong', { status: 200 })
	}

	if (pathname.startsWith('/_next') || pathname.startsWith('/api') || isStaticAsset(pathname)) {
		return NextResponse.next()
	}

	const token = request.cookies.get('token')?.value ?? null
	const locale = getLocaleFromPath(pathname)

	if (token) {
		if (isRootOrLocaleOnly(pathname, locale)) {
			const url = request.nextUrl.clone()
			url.pathname =
				locale === routing.defaultLocale ? '/chat' : `/${locale}/chat`
			return NextResponse.redirect(url)
		}

		if (isPublicPath(pathname)) {
			const url = request.nextUrl.clone()
			url.pathname =
				locale === routing.defaultLocale ? '/chat' : `/${locale}/chat`
			return NextResponse.redirect(url)
		}

		return intlMiddleware(request)
	}

	if (isPublicPath(pathname)) {
		return intlMiddleware(request)
	}

	if (isRootOrLocaleOnly(pathname, locale)) {
		return intlMiddleware(request)
	}

	const redirectUrl = encodeURIComponent(request.url)
	const loginUrl = new URL(
		`/${locale === routing.defaultLocale ? '' : `${locale}/`}login?redirect=${redirectUrl}`,
		request.url
	)

	return NextResponse.redirect(loginUrl)
}

export const config = {
	matcher: [
		'/',
		'/(en|fr|es|pt)/:path*',
		'/chat',
		'/chat/:path*',
		'/upgrade',
		'/upgrade/:path*',
		'/login',
		'/register',
		'/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|ping).*)',
	],
}
