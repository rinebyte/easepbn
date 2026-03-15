// src/components/layout/Header.tsx
import { useLocation } from 'react-router-dom'
import { LogOut, User, ChevronDown, Bell } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { analyticsApi, type Notification } from '@/api/analytics'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { format } from 'date-fns'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/sites': 'Sites',
  '/articles': 'Articles',
  '/posts': 'Posts',
  '/schedules': 'Schedules',
  '/templates': 'Templates',
  '/backlinks': 'Backlinks',
  '/settings': 'Settings',
}

function NotificationTypeLabel(type: Notification['type']) {
  const map: Record<Notification['type'], string> = {
    schedule_complete: 'Schedule',
    site_down: 'Site Down',
    bulk_complete: 'Bulk Complete',
    generation_failed: 'Generation',
  }
  return map[type] ?? type
}

export function Header() {
  const location = useLocation()
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()

  const title = pageTitles[location.pathname] ?? 'EasePBN'

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => analyticsApi.getNotifications(20),
    refetchInterval: 60_000,
  })

  const markReadMutation = useMutation({
    mutationFn: analyticsApi.markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllReadMutation = useMutation({
    mutationFn: analyticsApi.markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const notifications = notifData?.notifications ?? []
  const unreadCount = notifData?.unreadCount ?? 0

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <h1 className="text-lg font-semibold">{title}</h1>

      <div className="flex items-center gap-2">
        {/* Notification Bell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="p-0 text-sm font-semibold">
                Notifications
              </DropdownMenuLabel>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                >
                  Mark all read
                </Button>
              )}
            </div>
            <DropdownMenuSeparator />
            {notifications.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            )}
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((notif) => (
                <DropdownMenuItem
                  key={notif.id}
                  className="flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2.5"
                  onClick={() => {
                    if (!notif.read) markReadMutation.mutate(notif.id)
                  }}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {NotificationTypeLabel(notif.type)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!notif.read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(notif.createdAt), 'MMM d, HH:mm')}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium leading-tight">{notif.title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{notif.message}</p>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 text-sm">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary">
                <User className="h-4 w-4" />
              </div>
              <span className="hidden sm:block">{user?.email}</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <p className="text-xs text-muted-foreground">Signed in as</p>
              <p className="truncate text-sm font-medium">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive cursor-pointer"
              onClick={logout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
