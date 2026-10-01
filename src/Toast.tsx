import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { LibraryDefaults, ResolvedToast } from './resolve'
import type { ToastSlot, ToastSlotContext, ToastTransitionProps } from './types'

const INFO_BACKGROUND = '#08161FED'

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    backgroundColor: INFO_BACKGROUND
  },
  content: { flex: 1 },
  title: { color: 'white', fontSize: 14, fontWeight: '500' },
  description: { color: 'white', fontSize: 13, opacity: 0.85 },
  action: { paddingVertical: 4, paddingHorizontal: 8 },
  actionLabel: { color: 'white', fontSize: 14, fontWeight: '700' },
  info: { backgroundColor: INFO_BACKGROUND },
  success: { backgroundColor: '#166534' },
  warning: { backgroundColor: '#92400E' },
  error: { backgroundColor: '#991B1B' }
})

export function PassthroughTransition({ phase, onExited, children }: ToastTransitionProps) {
  useEffect(() => {
    if (phase === 'exiting') onExited()
  }, [phase, onExited])
  return <>{children}</>
}

export const libraryDefaults: LibraryDefaults = {
  duration: 3000,
  dismissible: true,
  offset: 20,
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  transition: PassthroughTransition,
  styles: {
    containerStyle: styles.container,
    titleStyle: styles.title,
    descriptionStyle: styles.description,
    actionStyle: styles.action,
    actionLabelStyle: styles.actionLabel
  },
  variantStyles: {
    info: { containerStyle: styles.info },
    success: { containerStyle: styles.success },
    warning: { containerStyle: styles.warning },
    error: { containerStyle: styles.error }
  }
}

export interface ToastProps<TPayload> {
  readonly context: ToastSlotContext<TPayload>
  readonly resolved: ResolvedToast<TPayload>
}

const renderPart = <TPayload,>(
  slot: ToastSlot<TPayload> | undefined,
  context: ToastSlotContext<TPayload>,
  fallback: () => ReactNode
): ReactNode => (slot ? slot(context) : fallback())

export function Toast<TPayload>({ context, resolved }: ToastProps<TPayload>) {
  const { toast, dismiss, pressAction } = context
  const { icon, dismissible } = resolved
  const iconNode = typeof icon === 'function' ? icon(context) : icon
  const hasIcon = iconNode !== undefined && iconNode !== null && iconNode !== false
  const { action } = toast

  const text = (
    <>
      {renderPart(resolved.renderTitle, context, () => (
        <Text testID='toast-title' style={resolved.titleStyle}>
          {toast.title}
        </Text>
      ))}
      {toast.description
        ? renderPart(resolved.renderDescription, context, () => (
            <Text testID='toast-description' style={resolved.descriptionStyle}>
              {toast.description}
            </Text>
          ))
        : null}
    </>
  )

  const parts = (
    <>
      {hasIcon ? (
        <View
          testID='toast-icon'
          accessibilityElementsHidden
          importantForAccessibility='no-hide-descendants'
        >
          {iconNode}
        </View>
      ) : null}
      {dismissible ? (
        <Pressable
          testID='toast-content'
          accessibilityRole='button'
          onPress={dismiss}
          style={styles.content}
        >
          {text}
        </Pressable>
      ) : (
        <View testID='toast-content' accessible style={styles.content}>
          {text}
        </View>
      )}
      {action
        ? renderPart(resolved.renderAction, context, () => (
            <Pressable
              testID='toast-action'
              accessibilityRole='button'
              accessibilityLabel={action.label}
              hitSlop={8}
              onPress={() => void pressAction()}
              style={resolved.actionStyle}
            >
              <Text style={resolved.actionLabelStyle}>{action.label}</Text>
            </Pressable>
          ))
        : null}
    </>
  )

  return dismissible ? (
    <Pressable
      testID='toast-container'
      accessible={false}
      onPress={dismiss}
      style={resolved.containerStyle}
    >
      {parts}
    </Pressable>
  ) : (
    <View testID='toast-container' style={resolved.containerStyle}>
      {parts}
    </View>
  )
}
