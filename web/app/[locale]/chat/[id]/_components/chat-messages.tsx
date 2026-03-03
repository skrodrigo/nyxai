'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
	useStickToBottomContext,
} from '@/components/ai-elements/conversation'
import { Loader } from '@/components/ai-elements/loader'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Action, Actions } from '@/components/ai-elements/actions'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Response } from '@/components/ai-elements/response'
import { Image } from '@/components/ai-elements/image'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import {
	ArrowLeft02Icon,
	ArrowRight02Icon,
	Copy01Icon,
	Download01Icon,
	Edit03Icon,
	ReloadIcon,
} from '@hugeicons/core-free-icons'
import type { UIMessage } from '@ai-sdk/react'
import { toast } from 'sonner'
import { toApiErrorPayload } from '@/data/api-error'
import { chatService } from '@/data/chat'
import { chatsService } from '@/data/chats'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTranslations } from 'next-intl'
import type { Artifact } from '@/data/artifacts'
import { routing } from '../../../../../i18n/routing'


interface ChatMessagesProps {
	chatId?: string
	activeBranchId: string | null
	canWebSearch: boolean
	isStreaming: boolean
	isTemporary: boolean
	messages: UIMessage[]
	model: string
	status: string
	webSearch: boolean
	setActiveBranchId: (branchId: string | null) => void
	setIsStreaming: (value: boolean) => void
	setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void
	regenerate: (args?: any) => void
	router: AppRouterInstance
	artifacts?: Artifact[]
	onOpenArtifact?: (artifact: Artifact) => void
	selectedArtifactId: string | null
	setSelectedArtifactId: (id: string | null) => void
}

function getLocaleFromPathname(pathname: string | null) {
	if (!pathname) return null
	const parts = pathname.split('/').filter(Boolean)
	const candidate = parts[0] ?? null
	if (!candidate) return null
	if (!routing.locales.includes(candidate as typeof routing.locales[number])) return null
	return candidate
}


function ScrollHandler() {
	const { scrollToBottom } = useStickToBottomContext()

	useEffect(() => {
		const handleResize = () => {
			scrollToBottom()
		}

		window.addEventListener('prompt-input-resize', handleResize)
		return () => window.removeEventListener('prompt-input-resize', handleResize)
	}, [scrollToBottom])

	return null
}

export function ChatMessages({
	chatId,
	activeBranchId,
	canWebSearch,
	isStreaming,
	isTemporary,
	messages,
	model,
	status,
	webSearch,
	setActiveBranchId,
	setIsStreaming,
	setMessages,
	regenerate,
	router,
	artifacts = [],
	onOpenArtifact,
	selectedArtifactId,
	setSelectedArtifactId,
}: ChatMessagesProps) {
	const t = useTranslations('chatMessages')
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
	const [editingText, setEditingText] = useState('')
	const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null)
	const isMobile = useIsMobile()

	const stableMessageIds = messages.map((m, idx) => m.id ?? `m-${idx}`)
	const stableMessageIdSet = useRef<Set<string>>(new Set())
	stableMessageIdSet.current = new Set(stableMessageIds)
	const unmatchedArtifacts = artifacts.filter((a) => !stableMessageIdSet.current.has(a.messageId))
	const lastAssistantStableId = (() => {
		for (let i = messages.length - 1; i >= 0; i -= 1) {
			if (messages[i]?.role === 'assistant') return stableMessageIds[i] ?? null
		}
		return null
	})()
	const loadedBranchMessageIdsRef = useRef<Set<string>>(new Set())
	const [messageBranches, setMessageBranches] = useState<
		Record<
			string,
			{
				options: any[]
				currentIndex: number
				currentBranchId: string
			}
		>
	>({})
	const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null)

	const toUiMessages = (rawMessages: any[]): UIMessage[] => {
		if (!Array.isArray(rawMessages)) return []
		return rawMessages
			.map((message) => {
				const content = message?.content
				if (message.role !== 'user' && message.role !== 'assistant') return null

				if (content?.type === 'file' && typeof content?.url === 'string') {
					return {
						id: message.id,
						role: message.role,
						parts: [
							{
								type: 'file',
								url: content.url,
								mediaType:
									typeof content?.mediaType === 'string'
										? content.mediaType
										: undefined,
							},
						],
					} as UIMessage
				}

				const text =
					typeof content === 'string'
						? content
						: typeof content?.text === 'string'
							? content.text
							: typeof content?.content === 'string'
								? content.content
								: null

				if (!text) return null

				return {
					id: message.id,
					role: message.role,
					parts: [{ type: 'text', text }],
				} as UIMessage
			})
			.filter(Boolean) as UIMessage[]
	}

	const ensureMessageBranchesLoaded = useCallback(
		async (messageId: string) => {
			if (!chatId) return
			if (messageBranches[messageId]) return
			if (loadedBranchMessageIdsRef.current.has(messageId)) return
			loadedBranchMessageIdsRef.current.add(messageId)
			try {
				const data = await chatsService.getMessageBranches(
					chatId,
					messageId,
					activeBranchId,
				)
				const options = Array.isArray(data?.options) ? data.options : []
				if (options.length <= 1) return
				setMessageBranches((prev) => ({
					...prev,
					[messageId]: {
						options,
						currentIndex:
							typeof data?.currentIndex === 'number'
								? data.currentIndex
								: 0,
						currentBranchId: data?.currentBranchId ?? '',
					},
				}))
			} catch {
			}
		},
		[activeBranchId, chatId, messageBranches],
	)

	const switchToBranch = async (
		branchId: string,
		sourceMessageId?: string,
		nextIndex?: number,
	) => {
		if (!chatId) return

		if (sourceMessageId && typeof nextIndex === 'number') {
			setMessageBranches((prev) => {
				const current = prev[sourceMessageId]
				if (!current) return prev
				return {
					...prev,
					[sourceMessageId]: {
						...current,
						currentIndex: nextIndex,
						currentBranchId: branchId,
					},
				}
			})
		}

		await chatsService.selectBranch(chatId, branchId)
		const payload = await chatsService.getById(chatId, branchId)
		const chat = payload?.data
		const nextMessages = toUiMessages(chat?.messages)
		setMessages(nextMessages)
		setActiveBranchId(chat?.activeBranchId ?? branchId)

		if (!sourceMessageId) return

		try {
			const data = await chatsService.getMessageBranches(
				chatId,
				sourceMessageId,
				chat?.activeBranchId ?? branchId,
			)
			const options = Array.isArray(data?.options) ? data.options : []
			if (options.length <= 1) return

			setMessageBranches((prev) => ({
				...prev,
				[sourceMessageId]: {
					options,
					currentIndex:
						typeof data?.currentIndex === 'number'
							? data.currentIndex
							: 0,
					currentBranchId:
						data?.currentBranchId ??
						(chat?.activeBranchId ?? branchId),
				},
			}))
		} catch {
		}
	}

	const refreshMessageBranches = useCallback(
		async (messageId: string, currentBranchId?: string | null) => {
			if (!chatId) return
			try {
				const data = await chatsService.getMessageBranches(
					chatId,
					messageId,
					currentBranchId ?? activeBranchId,
				)
				const options = Array.isArray(data?.options) ? data.options : []
				if (options.length <= 1) return
				setMessageBranches((prev) => ({
					...prev,
					[messageId]: {
						options,
						currentIndex:
							typeof data?.currentIndex === 'number'
								? data.currentIndex
								: options.length - 1,
						currentBranchId:
							data?.currentBranchId ??
							(currentBranchId ?? activeBranchId ?? ''),
					},
				}))
			} catch {
			}
		},
		[activeBranchId, chatId],
	)

	const handleRetryAssistant = useCallback(
		async (assistantMessageIndex: number) => {
			if (isStreaming) return
			if (!chatId && !isTemporary) return

			let userMessageIndex = -1
			for (let i = assistantMessageIndex - 1; i >= 0; i -= 1) {
				if (messages[i]?.role === 'user') {
					userMessageIndex = i
					break
				}
			}
			if (userMessageIndex < 0) return

			const userMessage = messages[userMessageIndex]
			const userMessageId =
				userMessage?.id ?? `m-${userMessageIndex}`

			const updatedMessages = messages.slice(0, userMessageIndex + 1)
			const assistantMessage: UIMessage = {
				id: (Date.now() + 1).toString(),
				role: 'assistant',
				parts: [{ type: 'text', text: '' }],
			}

			setMessages([...updatedMessages, assistantMessage])
			setIsStreaming(true)

			try {
				let accumulatedText = ''
				let createdChatId: string | null = null
				let nextBranchId: string | null = null

				const streamFn = isTemporary
					? chatService.streamTemporaryChat
					: chatService.streamChat

				await streamFn({
					body: {
						messages: updatedMessages,
						model,
						webSearch: canWebSearch ? webSearch : false,
						chatId,
						branchId: activeBranchId,
						isEdit: true,
						lastMessageId: userMessageId,
					},
					onEvent: (ev) => {
						if (ev.type === 'chat.created') {
							createdChatId = ev.chatId
							if (typeof ev.branchId === 'string') {
								nextBranchId = ev.branchId
								setActiveBranchId(ev.branchId)
							}
							if (typeof ev.assistantMessageId === 'string') {
								const newId = ev.assistantMessageId
								setMessages((prev: UIMessage[]) =>
									prev.map((msg: UIMessage) =>
										msg.id === assistantMessage.id
											? { ...msg, id: newId }
											: msg,
									),
								)
							}
						}

						if (ev.type === 'response.output_text.delta') {
							accumulatedText += ev.delta
							setMessages((prev: UIMessage[]) =>
								prev.map((msg: UIMessage) =>
									msg.id === assistantMessage.id
										? {
											...msg,
											parts: [
												{ type: 'text', text: accumulatedText },
											],
										}
										: msg,
								),
							)
						}

						if (ev.type === 'response.completed') {
							if (!createdChatId) createdChatId = ev.chatId
							if (typeof ev.branchId === 'string') {
								nextBranchId = ev.branchId
								setActiveBranchId(ev.branchId)
							}
						}

						if (ev.type === 'response.error') {
							throw new Error(ev.error)
						}
					},
				})

				setIsStreaming(false)
				await refreshMessageBranches(userMessageId, nextBranchId)

				const finalChatId = chatId || createdChatId
				if (!finalChatId) return

				try {
					const payload = await chatsService.getById(
						finalChatId,
						nextBranchId ?? activeBranchId,
					)
					const chat = payload?.data
					const nextMessages = toUiMessages(chat?.messages)
					setMessages(nextMessages)
					setActiveBranchId(chat?.activeBranchId ?? nextBranchId)
				} catch {
				}
			} catch (error) {
				setIsStreaming(false)
				setMessages((prev: UIMessage[]) => prev.slice(0, -1))
				toast.error(toApiErrorPayload(error).error)
			}
		},
		[
			activeBranchId,
			canWebSearch,
			chatId,
			isStreaming,
			isTemporary,
			messages,
			model,
			refreshMessageBranches,
			setActiveBranchId,
			setIsStreaming,
			setMessages,
			webSearch,
		],
	)

	useEffect(() => {
		if (!isMobile) return
		if (!chatId) return
		const userMessages = messages.filter(
			(m) => m.role === 'user' && typeof m.id === 'string' && m.id.length > 0,
		)
		for (const message of userMessages) {
			void ensureMessageBranchesLoaded(message.id)
		}
	}, [chatId, ensureMessageBranchesLoaded, isMobile, messages])

	return (
		<div className="flex flex-col w-full mx-auto h-full">
			<div
				className="w-full max-w-3xl mx-auto flex-1 overflow-y-auto scrollbar-hidden"
				style={{
					scrollbarWidth: 'none',
					msOverflowStyle: 'none',
				}}
			>
				<Conversation className="relative size-full pt-2">
					<ScrollHandler />
					<ConversationContent>
						{messages.map((message: UIMessage, messageIndex: number) => {
							const messageStableId =
								message.id ?? `m-${messageIndex}`

							const assistantMessageText =
								message.parts
									?.filter((part: any) => part.type === 'text')
									.map(
										(part: any) =>
											(part as { text: string }).text,
									)
									.join('') || ''

							const userMessageText =
								message.parts
									?.filter((part: any) => part.type === 'text')
									.map(
										(part: any) =>
											(part as { text: string }).text,
									)
									.join('') || ''

							const isEmptyAssistantMessage =
								message.role === 'assistant' &&
								assistantMessageText.trim() === '' &&
								isStreaming

							if (isEmptyAssistantMessage) {
								return (
									<Loader
										key={message.id ?? `m-${messageIndex}`}
									/>
								)
							}

							return (
								<div key={messageStableId}>
									<Message
										from={message.role}
										key={`mi-${messageStableId}`}
									>
										<div
											className={
												message.role === 'user'
													? editingMessageId === messageStableId
														? 'flex w-full flex-col items-stretch'
														: 'flex flex-col items-end'
													: 'flex flex-col'
											}
										>
											<MessageContent
												className={
													editingMessageId === messageStableId
														? 'w-full mx-0 px-2 py-2'
														: undefined
												}
											>
												{message.parts?.map((part: any, i: number) => {
													switch (part.type) {
														case 'text': {
															const isLastMessage =
																messageIndex === messages.length - 1
															const isEditing =
																editingMessageId === messageStableId

															const syncEditingTextareaHeight = () => {
																const el = editingTextareaRef.current
																if (!el) return
																el.style.height = '0px'
																const next = Math.min(el.scrollHeight, 300)
																el.style.height = `${next}px`
															}

															const submitEdit = async () => {
																const nextText = editingText.trim()
																if (!nextText || isStreaming) return

																setEditingMessageId(null)
																setEditingText('')

																const updatedMessages = messages
																	.map((m, idx) => {
																		const stableId =
																			m.id ?? `m-${idx}`
																		if (stableId !== messageStableId) return m
																		const nextParts = (m.parts ?? []).map(
																			(p: any) =>
																				p.type === 'text'
																					? { ...p, text: nextText }
																					: p,
																		)
																		return { ...m, parts: nextParts }
																	})
																	.slice(0, messageIndex + 1)

																const assistantMessage: UIMessage = {
																	id: (Date.now() + 1).toString(),
																	role: 'assistant',
																	parts: [{ type: 'text', text: '' }],
																}

																setMessages([
																	...updatedMessages,
																	assistantMessage,
																])
																setIsStreaming(true)

																try {
																	let accumulatedText = ''
																	let createdChatId: string | null = null

																	const streamFn = isTemporary
																		? chatService.streamTemporaryChat
																		: chatService.streamChat

																	await streamFn({
																		body: {
																			messages: updatedMessages,
																			model,
																			webSearch: canWebSearch
																				? webSearch
																				: false,
																			chatId,
																			branchId: activeBranchId,
																			isEdit: true,
																			lastMessageId: messageStableId,
																		},
																		onEvent: (ev) => {
																			if (ev.type === 'chat.created') {
																				createdChatId = ev.chatId
																				if (typeof ev.branchId === 'string') {
																					setActiveBranchId(ev.branchId)
																				}
																			}

																			if (ev.type === 'response.output_text.delta') {
																				accumulatedText += ev.delta
																				setMessages((prev: UIMessage[]) =>
																					prev.map((msg: UIMessage) =>
																						msg.id === assistantMessage.id
																							? {
																								...msg,
																								parts: [
																									{ type: 'text', text: accumulatedText },
																								],
																							}
																							: msg,
																					),
																				)
																			}

																			if (ev.type === 'response.error') {
																				throw new Error(ev.error)
																			}
																		},
																	})

																	setIsStreaming(false)

																	if (!chatId && !isTemporary && createdChatId) {
																		const locale = getLocaleFromPathname(window.location.pathname)
																		router.push(locale ? `/${locale}/chat/${createdChatId}` : `/chat/${createdChatId}`)
																	}
																} catch (error) {
																	setIsStreaming(false)
																	setMessages((prev: UIMessage[]) => prev.slice(0, -1))
																	toast.error(toApiErrorPayload(error).error)
																}
															}

															const cancelEdit = () => {
																setEditingMessageId(null)
																setEditingText('')
															}

															return (
																<div key={`${messageStableId}-${i}`}>
																	{isEditing ? (
																		<div className="w-full">
																			<div className="w-full rounded-3xl bg-muted/60 px-3 py-2">
																				<textarea
																					ref={editingTextareaRef}
																					value={editingText}
																					onChange={(e) => {
																						setEditingText(e.target.value)
																						syncEditingTextareaHeight()
																					}}
																					onFocus={syncEditingTextareaHeight}
																					className="max-h-[300px] w-full resize-none overflow-y-auto bg-transparent text-sm outline-none"
																					rows={1}
																					autoFocus
																				/>
																			</div>
																			<div className="mt-2 flex justify-end gap-2">
																				<Button
																					size="sm"
																					variant="secondary"
																					onClick={cancelEdit}
																				>
																					{t('cancel')}
																				</Button>
																				<Button
																					size="sm"
																					onClick={submitEdit}
																					disabled={!editingText.trim()}
																				>
																					{t('send')}
																				</Button>
																			</div>
																		</div>
																	) : (
																		<div className="group">
																			<Response>{part.text}</Response>
																		</div>
																	)}
																</div>
															)
														}
														case 'reasoning':
															return (
																<Reasoning
																	key={`${message.id}-${i}`}
																	className="w-full"
																	isStreaming={status === 'streaming'}
																>
																	<ReasoningTrigger />
																	<ReasoningContent>
																		{part.text}
																	</ReasoningContent>
																</Reasoning>
															)
														case 'file':
															return (
																<Dialog key={`${messageStableId}-${i}`}>
																	<DialogTrigger asChild>
																		<button className="cursor-zoom-in">
																			<Image
																				url={part.url}
																				mediaType={part.mediaType}
																				alt={part.filename ?? ''}
																			/>
																		</button>
																	</DialogTrigger>
																	<DialogContent className="max-w-4xl p-4 overflow-hidden bg-transparent border-0">
																		<DialogTitle />
																		<img
																			src={part.url}
																			alt={part.filename ?? ''}
																			className="w-full h-auto max-h-[80vh] object-contain"
																		/>
																	</DialogContent>
																</Dialog>
															)
														default:
															return null
													}
												})}
											</MessageContent>
											{(() => {
												const relatedArtifacts = artifacts.filter(
													(a) => a.messageId === messageStableId,
												)
												const fallbackArtifacts =
													message.role === 'assistant' &&
														messageStableId === lastAssistantStableId
														? unmatchedArtifacts
														: []
												const allArtifacts = [...relatedArtifacts, ...fallbackArtifacts]
												if (message.role !== 'assistant') return null
												if (allArtifacts.length === 0) return null
												return (
													<div className="flex flex-col gap-2 mt-3">
														{allArtifacts.map((artifact) => (
															<Button
																key={artifact.id}
																variant='outline'
																onClick={() => {
																	setSelectedArtifactId(artifact.id)
																	onOpenArtifact?.(artifact)
																}}
																className={`rounded-xl! h-14 max-w-md justify-between ${selectedArtifactId === artifact.id
																	? 'bg-background! border-border!'
																	: 'bg-muted!'
																	}`}
																disabled={artifact.status === 'processing'}
															>
																<div className="flex flex-col justify-start items-start">
																	<p className="font-medium text-sm truncate">{artifact.title}</p>
																	{artifact.status === 'processing' ? (
																		<div className="flex items-center gap-2">
																			<div className="h-3 w-20 bg-muted-foreground/20 rounded animate-pulse" />
																			<span className="text-xs text-muted-foreground">Gerando...</span>
																		</div>
																	) : (
																		<p className="text-xs text-muted-foreground">Clique para ver</p>
																	)}
																</div>
																{artifact.status === 'processing' && (
																	<span className="size-2 bg-primary rounded-full animate-pulse" />
																)}
															</Button>
														))}
													</div>
												)
											})()}
											{message.role === 'assistant' && (
												<Actions className="mt-2">
													<Action
														onClick={() => void handleRetryAssistant(messageIndex)}
														tooltip={t('retry')}
														label="Retry"
													>
														<Icon
															icon={ReloadIcon}
															className="size-[18px]"
														/>
													</Action>
													<Action
														onClick={() => {
															const text = message.parts
																?.filter((p: any) => p.type === 'text')
																.map((p: any) => p.text)
																.join('')
															navigator.clipboard.writeText(text)
														}}
														tooltip={t('copy')}
														label="Copy"
													>
														<Icon
															icon={Copy01Icon}
															className="size-[18px]"
														/>
													</Action>
													{message.parts?.some((p: any) => p.type === 'file') && (
														<Action
															onClick={() => {
																const filePart = message.parts?.find((p: any) => p.type === 'file') as any
																if (filePart?.url) {
																	const link = document.createElement('a')
																	link.href = filePart.url
																	link.download = filePart.filename || 'image'
																	link.click()
																}
															}}
															tooltip="Download"
															label="Download"
														>
															<Icon icon={Download01Icon} className="size-[18px]" />
														</Action>
													)}
												</Actions>
											)}
											{message.role === 'user' &&
												editingMessageId !== messageStableId &&
												userMessageText.trim() && (
													<div
														className={
															isMobile
																? 'my-1 opacity-100'
																: 'my-1 opacity-0 transition-opacity group-hover:opacity-100'
														}
														onMouseEnter={() => {
															if (isMobile) return
															if (!chatId) return
															void ensureMessageBranchesLoaded(messageStableId)
														}}
														onPointerDown={() => {
															if (!isMobile) return
															if (!chatId) return
															void ensureMessageBranchesLoaded(messageStableId)
														}}
													>
														<Actions>
															<Action
																onClick={() => {
																	setEditingMessageId(messageStableId)
																	setEditingText(userMessageText)
																	setTimeout(() => {
																		const el = editingTextareaRef.current
																		if (!el) return
																		el.style.height = '0px'
																		const next = Math.min(el.scrollHeight, 300)
																		el.style.height = `${next}px`
																	}, 0)
																}}
																tooltip={t('edit')}
																label="Edit"
															>
																<Icon
																	icon={Edit03Icon}
																	className="size-[18px]"
																/>
															</Action>
															<Action
																onClick={() =>
																	navigator.clipboard.writeText(userMessageText)
																}
																tooltip={t('copy')}
																label="Copy"
															>
																<Icon
																	icon={Copy01Icon}
																	className="size-[18px]"
																/>
															</Action>
															{message.parts?.some((p: any) => p.type === 'file') && (
																<Action
																	onClick={() => {
																		const filePart = message.parts?.find((p: any) => p.type === 'file') as any
																		if (filePart?.url) {
																			const link = document.createElement('a')
																			link.href = filePart.url
																			link.download = filePart.filename || 'image'
																			link.click()
																		}
																	}}
																	tooltip="Download"
																	label="Download"
																>
																	<Icon icon={Download01Icon} className="size-[18px]" />
																</Action>
															)}
															{chatId &&
																messageBranches[messageStableId] &&
																(messageBranches[messageStableId].options
																	?.length ?? 0) > 1 && (
																	<TooltipProvider >
																		<div className="flex items-center gap-1">
																			<Tooltip >
																				<TooltipTrigger asChild >
																					<button
																						onClick={async () => {
																							const branchState =
																								messageBranches[messageStableId]
																							const nextIndex =
																								branchState.currentIndex - 1
																							if (nextIndex < 0) return
																							const nextBranchId =
																								branchState.options[nextIndex]
																									?.branchId
																							if (!nextBranchId) return
																							await switchToBranch(
																								nextBranchId,
																								messageStableId,
																								nextIndex,
																							)
																						}}
																						disabled={
																							messageBranches[messageStableId]
																								.currentIndex === 0
																						}
																						className="p-1 rounded-full hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
																					>
																						<Icon
																							icon={ArrowLeft02Icon}
																							className="size-[18px]"
																						/>
																					</button>
																				</TooltipTrigger>
																				<TooltipContent side="bottom" sideOffset={6}>{t('previous')}</TooltipContent>
																			</Tooltip>
																			<span className="text-xs text-muted-foreground min-w-[3ch] text-center">
																				{messageBranches[messageStableId].currentIndex + 1}/
																				{messageBranches[messageStableId].options.length}
																			</span>
																			<Tooltip>
																				<TooltipTrigger asChild>
																					<button
																						onClick={async () => {
																							const branchState =
																								messageBranches[messageStableId]
																							const nextIndex =
																								branchState.currentIndex + 1
																							if (nextIndex >= branchState.options.length) return
																							const nextBranchId =
																								branchState.options[nextIndex]
																									?.branchId
																							if (!nextBranchId) return
																							await switchToBranch(
																								nextBranchId,
																								messageStableId,
																								nextIndex,
																							)
																						}}
																						disabled={
																							messageBranches[messageStableId]
																								.currentIndex ===
																							messageBranches[messageStableId]
																								.options.length - 1
																						}
																						className="p-1 rounded-full hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
																					>
																						<Icon
																							icon={ArrowRight02Icon}
																							className="size-[18px]"
																						/>
																					</button>
																				</TooltipTrigger>
																				<TooltipContent side="bottom" sideOffset={6}>{t('next')}</TooltipContent>
																			</Tooltip>
																		</div>
																	</TooltipProvider>
																)}
														</Actions>
													</div>
												)}
										</div>
									</Message>
								</div>
							)
						})}
						{status === 'submitted' && <Loader />}
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation >
			</div >
		</div >
	)
}
