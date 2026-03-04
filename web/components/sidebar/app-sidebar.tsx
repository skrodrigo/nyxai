"use client";

import { NavUser } from "@/components/sidebar/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import Image from "next/image";
import { NavChatHistory } from "../chat/nav-chat-history";
import { Button } from "../ui/button";
import { SidebarSearch } from "./sidebar-search";
import Link from "next/link";
import { useEffect, useState } from "react";
import { chatsService } from "@/data/chats";
import { meService, type MeUser } from "@/data/me";
import { ArchivedChatsButton } from '@/components/sidebar/archived-chats-button'
import { useTranslations, useLocale } from 'next-intl'
import { Icon } from "../ui/icon";
import { Edit03Icon } from "@hugeicons/core-free-icons";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  chats: { id: string; title: string; pinnedAt?: string | null }[]
}

export default function AppSidebar({ chats: initialChats, ...props }: AppSidebarProps) {
  const [chats, setChats] = useState(initialChats);
  const [user, setUser] = useState<{ name: string; email: string; avatar: string } | null>(null);
  const t = useTranslations()
  const locale = useLocale()

  useEffect(() => {
    const refresh = () => {
      chatsService.list().then((res) => {
        const data = res?.data;
        if (Array.isArray(data)) setChats(data);
      }).catch(() => { });
    };
    refresh();
    window.addEventListener('chats:refresh', refresh);
    return () => window.removeEventListener('chats:refresh', refresh);
  }, []);

  useEffect(() => {
    const refreshUser = () => {
      meService.get().then((u: MeUser) => {
        setUser({
          name: u.name || 'User',
          email: u.email || '',
          avatar: u.image || '',
        });
      }).catch(() => {
        setUser({ name: 'User', email: '', avatar: '' });
      });
    };
    refreshUser();
    window.addEventListener('user:refresh', refreshUser);
    return () => window.removeEventListener('user:refresh', refreshUser);
  }, []);

  return (
    <div className="flex items-start gap-2">
      <div className="rounded-md">
        <Sidebar variant="floating" {...props}>
          <SidebarHeader >
            <div className="flex items-center gap-2">
              <Image src="/logos/pumkin.svg" alt="Logo" width={100} height={100} priority quality={100} className="m-2" />
            </div>
            <div className="mt-2 flex w-full flex-col">
              <Link href={locale === 'pt' ? '/chat' : `/${locale}/chat`} className="flex-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start gap-2 px-2 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                >
                  <Icon icon={Edit03Icon} className="size-[18px]" />
                  <span>{t('sidebar.newChat')}</span>
                </Button>
              </Link>
              <SidebarSearch chats={chats} />
              <ArchivedChatsButton onChanged={() => {
                chatsService.list().then((res) => {
                  const data = res?.data
                  if (Array.isArray(data)) setChats(data)
                }).catch(() => { })
              }} />
            </div>
          </SidebarHeader >
          <SidebarContent>
            <NavChatHistory chats={chats} onChatsChange={setChats} />
          </SidebarContent>
          <SidebarFooter>
            <NavUser user={user ?? { name: 'User', email: '', avatar: '' }} />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
      </div>
    </div>
  )
}
