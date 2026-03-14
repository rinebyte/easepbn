import { useState, useCallback } from 'react'

export type ToastVariant = 'default' | 'destructive' | 'success'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

type ToastInput = Omit<Toast, 'id'>

let toastListeners: Array<(toasts: Toast[]) => void> = []
let toastList: Toast[] = []

function notifyListeners() {
  toastListeners.forEach((l) => l([...toastList]))
}

export function toast(input: ToastInput) {
  const id = crypto.randomUUID()
  const newToast: Toast = { id, duration: 4000, ...input }
  toastList = [...toastList, newToast]
  notifyListeners()

  setTimeout(() => {
    toastList = toastList.filter((t) => t.id !== id)
    notifyListeners()
  }, newToast.duration)
}

export function useToastState() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const subscribe = useCallback(() => {
    const listener = (updated: Toast[]) => setToasts(updated)
    toastListeners.push(listener)
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener)
    }
  }, [])

  return { toasts, subscribe }
}

export function useToast() {
  return { toast }
}
