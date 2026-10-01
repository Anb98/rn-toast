import * as library from '../index'
import type {
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
} from '../index'

export type PublicTypes = [
  CreateToastOptions<unknown>,
  QueueDecision,
  QueueState<unknown>,
  QueueStrategy,
  ToastAction,
  ToastApi<unknown>,
  ToastContent<unknown>,
  ToastDefaults<unknown>,
  ToastIcon<unknown>,
  ToastId,
  ToastInsets,
  ToastInstance<unknown>,
  ToastLifecycle<unknown>,
  ToastOptions<unknown>,
  ToastPatch<unknown>,
  ToastPhase,
  ToastPromiseMessages<unknown, unknown>,
  ToastProviderProps<unknown>,
  ToastRecord<unknown>,
  ToastSlot<unknown>,
  ToastSlotContext<unknown>,
  ToastSlots<unknown>,
  ToastStyles,
  ToastTransitionProps,
  ToastVariant,
  ToastVariants
]

describe('public runtime surface', () => {
  it('exports exactly the provider, hook, imperative api and factory', () => {
    expect(Object.keys(library).sort()).toEqual(['ToastProvider', 'createToast', 'toast', 'useToast'])
  })

  it('has no default export and does not leak the store', () => {
    expect('default' in library).toBe(false)
    expect('ToastStore' in library).toBe(false)
  })

  it('exports a working default instance', () => {
    expect(typeof library.toast.show({ title: 'Hi' })).toBe('string')
    expect(typeof library.ToastProvider).toBe('function')
    expect(typeof library.useToast).toBe('function')
  })
})
