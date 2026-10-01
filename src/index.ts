import { createToast } from './createToast'

export { createToast }
export const { ToastProvider, useToast, toast } = createToast()

export type {
  CreateToastOptions,
  QueueDecision,
  QueueState,
  QueueStrategy,
  ToastAction,
  ToastApi,
  ToastContent,
  ToastDefaults,
  ToastIcon,
  ToastId,
  ToastInsets,
  ToastInstance,
  ToastLifecycle,
  ToastOptions,
  ToastPatch,
  ToastPhase,
  ToastPromiseMessages,
  ToastProviderProps,
  ToastRecord,
  ToastSlot,
  ToastSlotContext,
  ToastSlots,
  ToastStyles,
  ToastTransitionProps,
  ToastVariant,
  ToastVariants
} from './types'
