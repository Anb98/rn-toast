import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { StyleProp, TextStyle, ViewStyle } from 'react-native'

export interface ToastVariants {
  info: true
  success: true
  warning: true
  error: true
}
export type ToastVariant = keyof ToastVariants
export type ToastId = string
export type ToastPhase = 'entering' | 'visible' | 'exiting'

export interface ToastInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ToastAction {
  label: string
  onPress: () => void | Promise<void>
}

export interface ToastRecord<TPayload> {
  readonly id: ToastId
  readonly phase: ToastPhase | 'queued'
  readonly title: string
  readonly description: string | undefined
  readonly variant: ToastVariant
  readonly action: ToastAction | undefined
  readonly payload: TPayload | undefined
}

export interface ToastSlotContext<TPayload> {
  readonly toast: ToastRecord<TPayload>
  readonly dismiss: () => void
  readonly pressAction: () => Promise<void>
}
export type ToastSlot<TPayload> = (context: ToastSlotContext<TPayload>) => ReactNode
export type ToastIcon<TPayload> = ReactNode | ToastSlot<TPayload>

export interface ToastSlots<TPayload> {
  renderToast?: ToastSlot<TPayload> | undefined
  icon?: ToastIcon<TPayload>
  renderTitle?: ToastSlot<TPayload> | undefined
  renderDescription?: ToastSlot<TPayload> | undefined
  renderAction?: ToastSlot<TPayload> | undefined
}

export interface ToastStyles {
  containerStyle?: StyleProp<ViewStyle>
  titleStyle?: StyleProp<TextStyle>
  descriptionStyle?: StyleProp<TextStyle>
  actionStyle?: StyleProp<ViewStyle>
  actionLabelStyle?: StyleProp<TextStyle>
}

export interface ToastTransitionProps {
  phase: ToastPhase
  onExited: () => void
  dismiss: () => void
  children: ReactNode
}

export interface ToastDefaults<TPayload> extends ToastSlots<TPayload>, ToastStyles {
  duration?: number | undefined
  dismissible?: boolean | undefined
  insets?: Partial<ToastInsets> | undefined
  offset?: number | undefined
  transition?: ComponentType<ToastTransitionProps> | undefined
}

export interface ToastLifecycle<TPayload> {
  onShow?: ((toast: ToastRecord<TPayload>) => void) | undefined
  onHide?: ((toast: ToastRecord<TPayload>) => void) | undefined
  onError?: ((error: unknown, toast: ToastRecord<TPayload>) => void) | undefined
}

export interface ToastOptions<TPayload> extends ToastDefaults<TPayload>, ToastLifecycle<TPayload> {
  id?: ToastId | undefined
  title: string
  description?: string | undefined
  variant?: ToastVariant | undefined
  action?: ToastAction | undefined
  payload?: TPayload | undefined
}

export type ToastPatch<TPayload> = Partial<Omit<ToastOptions<TPayload>, 'id'>>
export type ToastContent<TPayload> = string | Omit<ToastOptions<TPayload>, 'id'>

export interface ToastPromiseMessages<TValue, TPayload> {
  loading: ToastContent<TPayload>
  success: ToastContent<TPayload> | ((value: TValue) => ToastContent<TPayload>)
  error: ToastContent<TPayload> | ((error: unknown) => ToastContent<TPayload>)
}

export interface ToastApi<TPayload> {
  show: (options: ToastOptions<TPayload>) => ToastId
  update: (id: ToastId, patch: ToastPatch<TPayload>) => void
  dismiss: (id: ToastId) => void
  clear: () => void
  promise: <TValue>(
    promise: Promise<TValue>,
    messages: ToastPromiseMessages<TValue, TPayload>
  ) => Promise<TValue>
}

export interface QueueState<TPayload> {
  readonly occupying: readonly ToastRecord<TPayload>[]
  readonly pending: readonly ToastRecord<TPayload>[]
}

export interface QueueDecision {
  readonly activate: readonly ToastId[]
  readonly drop?: readonly ToastId[] | undefined
}

export interface QueueStrategy<TPayload = unknown> {
  select: (state: QueueState<TPayload>) => QueueDecision
}

export interface ToastProviderProps<TPayload>
  extends ToastDefaults<TPayload>,
    ToastLifecycle<TPayload> {
  children: ReactNode
  variants?: Partial<Record<ToastVariant, ToastDefaults<TPayload>>> | undefined
}

export interface CreateToastOptions<TPayload> {
  queue?: QueueStrategy<TPayload> | undefined
  exitTimeout?: number | undefined
}

export interface ToastInstance<TPayload> {
  ToastProvider: (props: ToastProviderProps<TPayload>) => ReactElement
  useToast: () => ToastApi<TPayload>
  toast: ToastApi<TPayload>
}
