'use client';

import { useEffect, useRef, useState } from 'react';
import { PromptInput, PromptInputTextarea, PromptInputSubmit, PromptInputWebSearchButton, PromptInputAttachmentButton, PromptInputContent } from '@/components/ai-elements/prompt-input';
import { Attachments, Attachment, AttachmentHoverCard, AttachmentHoverCardContent, AttachmentHoverCardTrigger, AttachmentInfo, AttachmentPreview, AttachmentRemove, getAttachmentLabel, getMediaCategory } from '@/components/ai-elements/attachments';
import { SignInDialog } from '@/components/common/sign-in-dialog';
import { SignUpDialog } from '@/components/common/sign-up-dialog';
import { Header } from '@/components/common/header';
import { useTranslations } from 'next-intl';

import Image from 'next/image';
import { modelSupportsWebSearch } from '@/data/model-capabilities';
import { nanoid } from 'nanoid';
import type { AttachmentData } from '@/components/ai-elements/attachments';

const models = [
  {
    name: 'Gemini',
    value: 'google/gemini-2.5-flash',
    icon: <Image src="/models/gemini.svg" alt="Gemini" width={20} height={20} priority quality={100} />,
  },
  {
    name: 'ChatGPT',
    value: 'openai/gpt-5-nano',
    icon: <Image src="/models/chatgpt.svg" alt="openai" width={20} height={20} priority quality={100} />,
  },
  {
    name: 'Claude',
    value: 'anthropic/claude-haiku-4.5',
    icon: <Image src="/models/claude.svg" alt="claude" width={20} height={20} priority quality={100} />,
    off: false,
  },
  {
    name: 'DeepSeek',
    value: 'deepseek/deepseek-v3.2',
    icon: <Image src="/models/deepseek.svg" alt="deepseek" width={20} height={20} priority quality={100} />,
  },
  {
    name: 'Kimi',
    value: 'moonshotai/kimi-k2.5',
    icon: <Image src="/models/kimi.svg" alt="moonshotai" width={18} height={18} priority quality={100} />,
  },
  {
    name: 'Grok',
    value: 'xai/grok-code-fast-1',
    icon: <Image src="/models/grok.svg" alt="xai" width={20} height={20} priority quality={100} />,
  },
  {
    name: 'GLM',
    value: 'zai/glm-5',
    icon: <Image src="/models/zai.svg" alt="zai" width={20} height={20} priority quality={100} />,
  },
];

export default function HomePage() {
  const t = useTranslations('home');
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [input, setInput] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const attachmentsRef = useRef<AttachmentData[]>([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.type !== 'file') continue;
        if (!attachment.url) continue;
        URL.revokeObjectURL(attachment.url);
      }
    };
  }, []);

  const canWebSearch = modelSupportsWebSearch(models[0].value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSignIn(true);
  };

  function handleAddAttachments(files: File[]) {
    const next = files.map<AttachmentData>((file) => ({
      id: nanoid(),
      type: 'file',
      filename: file.name,
      mediaType: file.type,
      url: URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...next]);
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((prev) => {
      const current = prev.find((a) => a.id === id);
      if (current?.type === 'file' && current.url) {
        URL.revokeObjectURL(current.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  }

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <Header onSignInClick={() => setShowSignIn(true)} onSignUpClick={() => setShowSignUp(true)} />
      <main className="flex flex-col items-center justify-center grow">
        <div className="w-full max-w-3xl px-4 flex flex-col items-center space-y-4">
          <h1 className="text-2xl">{t('title')}</h1>

          <div className="rounded-md w-full max-w-3xl mx-auto">
            {attachments.length > 0 && (
              <div className="mb-2 px-2">
                <Attachments variant="inline">
                  {attachments.map((attachment) => {
                    const mediaCategory = getMediaCategory(attachment);
                    const label = getAttachmentLabel(attachment);

                    return (
                      <AttachmentHoverCard key={attachment.id}>
                        <AttachmentHoverCardTrigger asChild>
                          <Attachment
                            data={attachment}
                            onRemove={() => handleRemoveAttachment(attachment.id)}
                          >
                            <AttachmentPreview className="size-[18px] rounded bg-background" />
                            <AttachmentInfo className="pr-6" />
                            <AttachmentRemove className="absolute right-1 dark:hover:bg-transparent hover:bg-transparent" label={t('remove')} />
                          </Attachment>
                        </AttachmentHoverCardTrigger>
                        <AttachmentHoverCardContent>
                          <div className="space-y-3">
                            {mediaCategory === 'image' &&
                              attachment.type === 'file' &&
                              attachment.url && (
                                <div className="flex max-h-96 w-80 items-center justify-center overflow-hidden rounded-md border">
                                  <img
                                    alt={label}
                                    className="max-h-full max-w-full object-contain"
                                    height={384}
                                    src={attachment.url}
                                    width={320}
                                  />
                                </div>
                              )}
                            <div className="space-y-1 px-0.5">
                              <h4 className="font-semibold text-sm leading-none">{label}</h4>
                              {attachment.mediaType && (
                                <p className="font-mono text-muted-foreground text-xs">{attachment.mediaType}</p>
                              )}
                            </div>
                          </div>
                        </AttachmentHoverCardContent>
                      </AttachmentHoverCard>
                    );
                  })}
                </Attachments>
              </div>
            )}

            <PromptInput onSubmit={handleSubmit}>
              <PromptInputContent
                leftContent={
                  <>
                    <PromptInputAttachmentButton
                      onFilesSelected={handleAddAttachments}
                      variant="ghost"
                      className="size-8"
                    />
                    {canWebSearch && (
                      <PromptInputWebSearchButton
                        active={webSearch}
                        onClick={() => setWebSearch(!webSearch)}
                      />
                    )}
                  </>
                }
                rightContent={<PromptInputSubmit disabled={!input} className="size-8" />}
              >
                <PromptInputTextarea
                  onChange={(e) => setInput(e.target.value)}
                  value={input}
                />
              </PromptInputContent>
            </PromptInput>
          </div>
        </div>
      </main>
      <SignInDialog
        open={showSignIn}
        onOpenChange={setShowSignIn}
        onSignUpClick={() => {
          setShowSignIn(false);
          setShowSignUp(true);
        }}
      />
      <SignUpDialog
        open={showSignUp}
        onOpenChange={setShowSignUp}
        onSignInClick={() => {
          setShowSignUp(false);
          setShowSignIn(true);
        }}
      />
    </div>
  );
}