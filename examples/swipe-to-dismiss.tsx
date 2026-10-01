import { useEffect, useMemo, useRef } from 'react'
import { Animated, Button, PanResponder, View } from 'react-native'
import { ToastProvider, toast } from '@anb98/rn-toast'
import type { ToastTransitionProps } from '@anb98/rn-toast'

const DISMISS_DISTANCE = 80
const EXIT_DISTANCE = 400
const DURATION = 200

export function SwipeToDismissTransition({
  phase,
  onExited,
  dismiss,
  children
}: ToastTransitionProps) {
  const translateX = useRef(new Animated.Value(0)).current
  const direction = useRef(1)

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, { dx, dy }) =>
          Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy),
        onPanResponderMove: Animated.event([null, { dx: translateX }], {
          useNativeDriver: false
        }),
        onPanResponderRelease: (_event, { dx }) => {
          if (Math.abs(dx) > DISMISS_DISTANCE) {
            direction.current = dx < 0 ? -1 : 1
            dismiss()
          } else {
            Animated.spring(translateX, { toValue: 0, useNativeDriver: false }).start()
          }
        }
      }),
    [dismiss, translateX]
  )

  useEffect(() => {
    if (phase !== 'exiting') return
    Animated.timing(translateX, {
      toValue: direction.current * EXIT_DISTANCE,
      duration: DURATION,
      useNativeDriver: false
    }).start(({ finished }) => {
      if (finished) onExited()
    })
  }, [phase, translateX, onExited])

  return (
    <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
      {children}
    </Animated.View>
  )
}

export function SwipeToDismissExample() {
  return (
    <ToastProvider transition={SwipeToDismissTransition}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Button
          title="Show sticky toast"
          onPress={() => toast.show({ title: 'Swipe me away', duration: Infinity })}
        />
      </View>
    </ToastProvider>
  )
}
