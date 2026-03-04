'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils';
import type { ChatStatus } from 'ai';
import React, { ComponentProps, KeyboardEventHandler, useState, useEffect, useLayoutEffect, Children, HTMLAttributes, useRef, createContext, useContext, useCallback } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { useTranslations } from 'next-intl'
import { Cancel01Icon, PlusSignIcon, Globe02Icon, Loading03Icon, StopIcon, ArrowUp02Icon } from '@hugeicons/core-free-icons';
import { Icon } from '@/components/ui/icon';

type PromptInputContextValue = {
  isMultiline: boolean;
  setIsMultiline: (value: boolean) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

export const usePromptInput = () => {
  const ctx = useContext(PromptInputContext);
  if (!ctx) throw new Error('usePromptInput must be used within PromptInput');
  return ctx;
};

export type PromptInputProps = HTMLAttributes<HTMLFormElement>;

export const PromptInput = ({ className, ...props }: PromptInputProps) => {
  const [isMultiline, setIsMultiline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <PromptInputContext.Provider value={{ isMultiline, setIsMultiline, textareaRef }}>
      <form
        className={cn(
          'min-w-0 overflow-hidden rounded-4xl border border-border/30 bg-muted light:border-border shadow-xs',
          isMultiline ? 'divide-y' : '',
          className
        )}
        {...props}
      />
    </PromptInputContext.Provider>
  );
};

export type PromptInputTextareaProps = React.ComponentProps<'textarea'> & {
};

export const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(({ onChange, className, placeholder, value, ...props }, forwardedRef) => {
  const t = useTranslations()
  const defaultPlaceholder = t('promptInput.placeholder')
  const { setIsMultiline, textareaRef: contextRef } = usePromptInput();
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const multilineRef = useRef(false);
  const shouldRestoreFocus = useRef(false);
  const savedSelection = useRef({ start: 0, end: 0 });
  const isTransitioning = useRef(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        return;
      }

      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const setRef = (el: HTMLTextAreaElement | null) => {
    (localRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    (contextRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    if (typeof forwardedRef === 'function') forwardedRef(el);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };

  const adjustHeight = useCallback(() => {
    const el = localRef.current;
    if (!el) return;

    const wasFocused = document.activeElement === el;
    const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 24;

    const prevHeight = parseFloat(el.style.height) || lineHeight;
    el.style.height = 'auto';
    const scrollHeight = el.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, lineHeight), 144);
    el.style.height = `${newHeight}px`;

    el.style.overflowY = newHeight >= 144 ? 'auto' : 'hidden';

    if (Math.abs(newHeight - prevHeight) > 1) {
      window.dispatchEvent(new CustomEvent('prompt-input-resize', { detail: { height: newHeight } }));
    }

    const text = el.value;
    const explicitLineBreaks = (text.match(/\n/g) || []).length;
    const isEmpty = text.trim().length === 0;

    const currentlyMultiline = multilineRef.current;

    if (isEmpty && currentlyMultiline) {
      multilineRef.current = false;
      setIsMultiline(false);
      return;
    }

    if (isTransitioning.current) return;

    const shouldActivate = !currentlyMultiline && (explicitLineBreaks >= 1 || scrollHeight > lineHeight * 1.8);
    const shouldDeactivate = currentlyMultiline && explicitLineBreaks === 0 && scrollHeight <= lineHeight * 1.3;

    if (shouldActivate || shouldDeactivate) {
      isTransitioning.current = true;

      const isNowMultiline = shouldActivate;
      multilineRef.current = isNowMultiline;

      if (wasFocused) {
        shouldRestoreFocus.current = true;
        savedSelection.current = {
          start: el.selectionStart ?? 0,
          end: el.selectionEnd ?? 0,
        };
      }

      setIsMultiline(isNowMultiline);

      setTimeout(() => {
        isTransitioning.current = false;
      }, 100);
    }
  }, [setIsMultiline]);

  useLayoutEffect(() => {
    if (shouldRestoreFocus.current) {
      shouldRestoreFocus.current = false;
      const el = localRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(savedSelection.current.start, savedSelection.current.end);
      }
    }
  });

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  return (
    <textarea
      ref={setRef}
      className={cn(
        'w-full placeholder:text-[16px] md:placeholder:text-[17px] resize-none rounded-none border-none shadow-none outline-none ring-0',
        'bg-transparent dark:bg-transparent focus-visible:ring-0 px-2 py-1',
        className
      )}
      name="message"
      onChange={(e) => {
        onChange?.(e);
      }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder ?? defaultPlaceholder}
      rows={1}
      value={value}
      {...props}
    />
  );
});

export type PromptInputContentProps = HTMLAttributes<HTMLDivElement> & {
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
};

export const PromptInputContent = ({
  className,
  leftContent,
  rightContent,
  children,
  ...props
}: PromptInputContentProps) => {
  const { isMultiline, textareaRef } = usePromptInput();

  const handleToolbarClick = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const length = el.value.length;
    el.setSelectionRange(length, length);
  };

  return (
    <div
      className={cn(
        'p-2',
        isMultiline ? 'flex flex-col' : 'flex items-center gap-2',
        className
      )}
      {...props}
    >
      {!isMultiline && (
        <div onClick={(e) => e.stopPropagation()}>{leftContent}</div>
      )}
      <div className={cn('flex min-w-0 flex-1', isMultiline ? 'w-full' : 'items-center')}>
        {children}
      </div>
      {isMultiline ? (
        <div
          className="mt-2 flex items-center justify-between gap-2 cursor-text"
          onClick={handleToolbarClick}
        >
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {leftContent}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            {rightContent}
          </div>
        </div>
      ) : (
        <div onClick={(e) => e.stopPropagation()}>{rightContent}</div>
      )}
    </div>
  );
};

export type PromptInputButtonProps = HTMLAttributes<HTMLButtonElement> & {
  variant?: 'ghost' | 'default';
  size?: 'icon' | 'default';
};

export const PromptInputButton = ({
  variant = 'ghost',
  className,
  size,
  ...props
}: PromptInputButtonProps) => {
  const newSize = (size ?? Children.count(props.children) > 1) ? 'default' : 'icon';

  return (
    <Button
      className={cn(
        'shrink-0 gap-1.5 rounded-md h-9 border-none',
        variant === 'ghost' && 'text-muted-foreground',
        newSize === 'default' && 'px-3',
        className
      )}
      size={newSize}
      type="button"
      variant={variant}
      {...props}
    />
  );
};

export type PromptInputWebSearchButtonProps = ComponentProps<typeof Button> & {
  active?: boolean;
  label?: string;
};

export const PromptInputWebSearchButton = ({
  active,
  label = 'Pesquisar',
  variant,
  className,
  ...props
}: PromptInputWebSearchButtonProps) => {
  const { isMultiline } = usePromptInput();

  return (
    <Button
      className={cn(
        'shrink-0 gap-1.5 h-9 border-none rounded-full',
        !active && 'text-muted-foreground',
        isMultiline && 'px-3',
        className
      )}
      size={isMultiline ? 'default' : 'icon'}
      type="button"
      variant={active ? 'default' : 'ghost'}
      {...props}
    >
      <Icon icon={Globe02Icon} size={16} />
      {isMultiline && <span>{label}</span>}
    </Button>
  );
};

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: ChatStatus;
};

export const PromptInputSubmit = ({
  className,
  variant = 'default',
  size = 'icon',
  status,
  children,
  ...props
}: PromptInputSubmitProps) => {
  let IconEl = <Icon icon={ArrowUp02Icon} className="size-[18px] rounded-full" />;

  if (status === 'submitted') {
    IconEl = <Icon icon={Loading03Icon} className="size-[18px] animate-spin rounded-full" />;
  } else if (status === 'streaming') {
    IconEl = <Icon icon={StopIcon} className="size-[18px] rounded-full fill-current" />;
  } else if (status === 'error') {
    IconEl = <Icon icon={Cancel01Icon} className="size-[18px] rounded-full" />;
  }

  return (
    <Button
      className={cn('gap-1.5 rounded-full border-none', className)}
      size={size}
      type="submit"
      variant={variant}
      {...props}
    >
      {children ?? IconEl}
    </Button>
  );
};

export type PromptInputModelSelectProps = ComponentProps<typeof Select>;

export const PromptInputModelSelect = (props: PromptInputModelSelectProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Select {...props} />
  );
};

export type PromptInputModelSelectTriggerProps = ComponentProps<
  typeof SelectTrigger
>;

export const PromptInputModelSelectTrigger = ({
  className,
  ...props
}: PromptInputModelSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      'font-medium text-muted-foreground dark:bg-transparent border-none hover:bg-transparent! shadow-none transition-colors',
      'dark:hover:bg-transparent! dark:aria-expanded:bg-transparent! aria-expanded:text-foreground',
      className
    )}
    {...props}
  />
);

export interface PromptInputModelSelectContentProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> {
  showSubscription?: boolean;
}

export const PromptInputModelSelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  PromptInputModelSelectContentProps
>(({ className, children, showSubscription = true, ...props }, ref) => {
  const [, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsLoading(false);
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <SelectContent
      className={cn(
        'w-[calc(100vw-3rem)] max-w-[400px] h-auto bg-muted',
        className
      )}
      collisionPadding={12}
      sideOffset={8}
      {...props}
    >
      <div className="h-auto overflow-y-auto">
        {children}
      </div>
    </SelectContent>
  );
});


export type PromptInputModelSelectItemProps = ComponentProps<typeof SelectItem>;

export const PromptInputModelSelectItem = ({
  className,
  ...props
}: PromptInputModelSelectItemProps) => (
  <SelectItem
    className={cn('flex items-center justify-between', className)}
    {...props}
  />
);

export type PromptInputModelSelectValueProps = ComponentProps<
  typeof SelectValue
>;

export const PromptInputModelSelectValue = ({
  className,
  ...props
}: PromptInputModelSelectValueProps) => (
  <SelectValue className={cn(className)} {...props} />
);

export type PromptInputAttachmentButtonProps = Omit<
  PromptInputButtonProps,
  'onClick'
> & {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  disabled?: boolean;
};

export const PromptInputAttachmentButton = ({
  className,
  onFilesSelected,
  accept,
  disabled,
  variant = 'ghost',
  size,
  ...props
}: PromptInputAttachmentButtonProps) => {
  const t = useTranslations()
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length === 0) return;
          onFilesSelected(files);
        }}
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              {...props}
              className={cn(
                'font-medium text-muted-foreground shadow-none transition-colors',
                'hover:bg-background hover:text-foreground',
                'dark:hover:bg-input/50',
                'rounded-full',
                className
              )}
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              size={size ?? 'icon'}
              type="button"
              variant={variant}
            >
              <Icon icon={PlusSignIcon} size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={6}>{t('promptInput.attach')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
};
