import { useEffect, useRef } from 'react'
import { Animated, Button, Pressable, StyleSheet, Text, View } from 'react-native'
import { ToastProvider, toast } from '@anb98/rn-toast'
import type { ToastTransitionProps } from '@anb98/rn-toast'

const BRAND = '#4F46E5'

function Badge({ glyph, color }: { glyph: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeGlyph}>{glyph}</Text>
    </View>
  )
}

const VARIANTS = {
  info: { icon: <Badge glyph="i" color={BRAND} />, containerStyle: { borderLeftColor: BRAND } },
  success: { icon: <Badge glyph="✓" color="#059669" />, containerStyle: { borderLeftColor: '#059669' } },
  warning: { icon: <Badge glyph="!" color="#D97706" />, containerStyle: { borderLeftColor: '#D97706' } },
  error: { icon: <Badge glyph="✕" color="#DC2626" />, containerStyle: { borderLeftColor: '#DC2626' } }
}

export function LiftTransition({ phase, onExited, children }: ToastTransitionProps) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const exiting = phase === 'exiting'
    const animation = exiting
      ? Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true })
      : Animated.spring(progress, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true })
    animation.start(({ finished }) => {
      if (exiting && finished) onExited()
    })
    return () => animation.stop()
  }, [phase, progress, onExited])

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] })
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] })

  return (
    <Animated.View style={{ opacity: progress, transform: [{ translateY }, { scale }] }}>
      {children}
    </Animated.View>
  )
}

const showPayment = () =>
  toast.show({
    title: 'Payment sent',
    description: '$48.00 to Ada Lovelace',
    variant: 'success',
    action: {
      label: 'Undo',
      onPress: () => {
        toast.show({ title: 'Payment cancelled', description: 'Nothing was charged.' })
      }
    }
  })

const showStorage = () =>
  toast.show({
    title: 'Storage almost full',
    description: '9.4 GB of 10 GB used',
    variant: 'warning'
  })

const showSyncError = () =>
  toast.show({
    title: 'Sync failed',
    description: 'Check your connection and try again.',
    variant: 'error',
    action: {
      label: 'Retry',
      onPress: () => {
        toast.show({ title: 'Synced', description: 'All changes are saved.', variant: 'success' })
      }
    }
  })

const queueAll = () => {
  showPayment()
  showStorage()
  showSyncError()
}

export function StyledToastExample() {
  return (
    <ToastProvider
      variants={VARIANTS}
      transition={LiftTransition}
      containerStyle={styles.container}
      titleStyle={styles.title}
      descriptionStyle={styles.description}
      renderAction={({ toast: { action }, pressAction }) => (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => void pressAction()}
          style={styles.action}
        >
          <Text style={styles.actionLabel}>{action?.label}</Text>
        </Pressable>
      )}
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Button title="Payment sent" onPress={showPayment} />
        <Button title="Storage warning" onPress={showStorage} />
        <Button title="Sync failed" onPress={showSyncError} />
        <Button title="Queue all three" onPress={queueAll} />
      </View>
    </ToastProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8
  },
  title: { color: '#111827', fontSize: 15, fontWeight: '600' },
  description: { color: '#4B5563', fontSize: 13, marginTop: 2 },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeGlyph: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  action: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  actionLabel: { color: BRAND, fontSize: 13, fontWeight: '700' }
})
