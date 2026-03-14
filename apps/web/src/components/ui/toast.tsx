import { useEffect } from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToastState, type ToastVariant } from '@/hooks/use-toast'

function ToastIcon({ variant }: { variant?: ToastVariant }) {
  if (variant === 'destructive') return <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
  if (variant === 'success') return <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
  return <Info className="h-4 w-4 text-blue-400 shrink-0" />
}

export function Toaster() {
  const { toasts, subscribe } = useToastState()

  useEffect(() => {
    const unsubscribe = subscribe()
    return unsubscribe
  }, [subscribe])

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          className={cn(
            'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-4 pr-8 shadow-lg transition-all',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out',
            'data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full',
            'data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
            t.variant === 'destructive'
              ? 'border-red-500/30 bg-red-950/80 text-red-100'
              : t.variant === 'success'
              ? 'border-green-500/30 bg-green-950/80 text-green-100'
              : 'border-border bg-background text-foreground'
          )}
          open={true}
        >
          <div className="flex items-start gap-3">
            <ToastIcon variant={t.variant} />
            <div className="grid gap-1">
              {t.title && (
                <ToastPrimitive.Title className="text-sm font-semibold">
                  {t.title}
                </ToastPrimitive.Title>
              )}
              {t.description && (
                <ToastPrimitive.Description className="text-sm opacity-90">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
          </div>
          <ToastPrimitive.Close className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2">
            <X className="h-4 w-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-4 sm:right-4 sm:top-auto sm:flex-col sm:max-w-[420px]" />
    </ToastPrimitive.Provider>
  )
}
