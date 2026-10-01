import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from 'react'
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native'

import { resolveDuration, resolveToast } from './resolve'
import { DEFAULT_EXIT_TIMEOUT, ToastStore, fifoQueue } from './store'
import type { StoreHost, ToastEntry } from './store'
import { Toast, libraryDefaults } from './Toast'
import type {
  CreateToastOptions,
  ToastApi,
  ToastContent,
  ToastInstance,
  ToastLifecycle,
  ToastPhase,
  ToastProviderProps,
  ToastRecord,
  ToastSlotContext
} from './types'

const HORIZONTAL_MARGIN = 12

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { zIndex: 1000, elevation: 1000 }
})

type ActiveEntry<TPayload> = ToastEntry<TPayload> & { readonly phase: ToastPhase }

const isActive = <TPayload,>(entry: ToastEntry<TPayload>): entry is ActiveEntry<TPayload> =>
  entry.phase !== 'queued'

const reportError = <TPayload,>(
  error: unknown,
  toast: ToastRecord<TPayload>,
  handlers: readonly ToastLifecycle<TPayload>['onError'][]
) => {
  let delivered = false
  let handlerThrew = false
  for (const handler of handlers) {
    if (!handler) continue
    delivered = true
    try {
      handler(error, toast)
    } catch {
      handlerThrew = true
    }
  }
  if ((!delivered || handlerThrew) && __DEV__) console.error('[rn-toast] A toast action failed.', error)
}

const toContent = <TPayload,>(content: ToastContent<TPayload>) =>
  typeof content === 'string' ? { title: content } : content

interface ToastItemProps<TPayload> {
  readonly store: ToastStore<TPayload>
  readonly entry: ActiveEntry<TPayload>
  readonly index: number
  readonly provider: ToastProviderProps<TPayload>
}

function ToastItem<TPayload>({ store, entry, index, provider }: ToastItemProps<TPayload>) {
  const { key, phase } = entry
  const resolved = resolveToast(entry.options, entry.variant, provider, libraryDefaults)
  const { insets, offset, transition: Transition } = resolved

  useEffect(() => {
    if (phase === 'entering') store.markVisible(key)
  }, [store, key, phase])

  const announcement = entry.description ? `${entry.title}. ${entry.description}` : entry.title
  const visible = phase === 'visible'
  useEffect(() => {
    if (visible && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(announcement)
  }, [visible, announcement])

  const dismiss = useCallback(() => store.close(key), [store, key])
  const onExited = useCallback(() => store.exited(key), [store, key])

  const inFlight = useRef(false)
  const pressAction = async (): Promise<void> => {
    const { action } = entry
    if (!action || inFlight.current) return
    inFlight.current = true
    try {
      await action.onPress()
    } catch (error) {
      reportError(error, entry, [entry.options.onError, provider.onError])
    } finally {
      inFlight.current = false
      store.close(key)
    }
  }

  const context: ToastSlotContext<TPayload> = { toast: entry, dismiss, pressAction }

  return (
    <View
      testID='toast'
      pointerEvents='box-none'
      collapsable={false}
      accessibilityRole='alert'
      accessibilityLiveRegion='polite'
      onAccessibilityEscape={resolved.dismissible ? dismiss : undefined}
      style={{
        marginTop: index === 0 ? insets.top + offset : offset,
        marginLeft: insets.left + HORIZONTAL_MARGIN,
        marginRight: insets.right + HORIZONTAL_MARGIN
      }}
    >
      <Transition phase={phase} onExited={onExited} dismiss={dismiss}>
        {resolved.renderToast ? (
          resolved.renderToast(context)
        ) : (
          <Toast context={context} resolved={resolved} />
        )}
      </Transition>
    </View>
  )
}

export function createToast<TPayload = never>(
  options?: CreateToastOptions<NoInfer<TPayload>>
): ToastInstance<TPayload> {
  const store = new ToastStore<TPayload>({
    queue: options?.queue ?? fifoQueue,
    exitTimeout: options?.exitTimeout ?? DEFAULT_EXIT_TIMEOUT
  })
  const ToastContext = createContext(false)

  const toast: ToastApi<TPayload> = {
    show: (toastOptions) => store.show(toastOptions),
    update: (id, patch) => store.update(id, patch),
    dismiss: (id) => store.dismiss(id),
    clear: () => store.clear(),
    promise: (promise, messages) => {
      const loading = toContent(messages.loading)
      const id = store.show({ ...loading, duration: loading.duration ?? Infinity })
      const settle = (content: ToastContent<TPayload>) => store.replace(id, toContent(content))
      promise
        .then(
          (value) =>
            settle(
              typeof messages.success === 'function' ? messages.success(value) : messages.success
            ),
          (reason: unknown) =>
            settle(typeof messages.error === 'function' ? messages.error(reason) : messages.error)
        )
        .catch((error: unknown) => {
          store.dismiss(id)
          if (__DEV__) console.error('[rn-toast] A toast.promise formatter threw.', error)
        })
      return promise
    }
  }

  const useToast = (): ToastApi<TPayload> => {
    if (!useContext(ToastContext)) {
      throw new Error(
        'useToast() must be called inside the ToastProvider returned by the same createToast() instance.'
      )
    }
    return toast
  }

  const ToastProvider = (props: ToastProviderProps<TPayload>) => {
    const latest = useRef(props)
    useLayoutEffect(() => {
      latest.current = props
    })
    const host = useMemo<StoreHost<TPayload>>(
      () => ({
        duration: (entry) =>
          resolveDuration(entry.options, entry.variant, latest.current, libraryDefaults.duration),
        onShow: (toast) => latest.current.onShow?.(toast),
        onHide: (toast) => latest.current.onHide?.(toast)
      }),
      []
    )
    useEffect(() => store.attach(host), [host])

    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    const active = snapshot.toasts.filter(isActive)
    const showOverlay = snapshot.host === host && active.length > 0

    return (
      <ToastContext.Provider value>
        <View style={styles.root}>
          {props.children}
          {showOverlay ? (
            <View
              testID='toast-overlay'
              pointerEvents='box-none'
              style={[StyleSheet.absoluteFill, styles.overlay]}
            >
              {active.map((entry, index) => (
                <ToastItem
                  key={entry.key}
                  store={store}
                  entry={entry}
                  index={index}
                  provider={props}
                />
              ))}
            </View>
          ) : null}
        </View>
      </ToastContext.Provider>
    )
  }

  return { ToastProvider, useToast, toast }
}
