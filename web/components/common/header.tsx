'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface HeaderProps {
  onSignInClick: () => void;
  onSignUpClick: () => void;
}

export function Header({ onSignInClick, onSignUpClick }: HeaderProps) {
  const t = useTranslations()
  return (
    <header className="w-full max-w-3xl mx-auto flex items-center justify-between p-1 bg-background">
      <div className="flex items-center gap-2">
        <Image src="/logos/pumkin.svg" alt="Pumkin Logo" width={24} height={24} />
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className='h-11' onClick={onSignUpClick}>
          {t('header.signUp')}
        </Button>
        <Button className='h-11' onClick={onSignInClick}>
          {t('header.signIn')}
        </Button>
      </div>
    </header>
  );
}
