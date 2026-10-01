import { useEffect } from 'react'
import { Button, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { ToastProvider, toast } from '@anb98/rn-toast'
import type { ToastTransitionProps } from '@anb98/rn-toast'

const DURATION = 250

export function ReanimatedTransition({ phase, onExited, children }: ToastTransitionProps) {
  const progress = useSharedValue(0)

  useEffect(() => {
    if (phase === 'exiting') {
      progress.value = withTiming(0, { duration: DURATION }, (finished) => {
        if (finished) runOnJS(onExited)()
      })
    } else {
      progress.value = withTiming(1, { duration: DURATION })
    }
  }, [phase, progress, onExited])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -24 }]
  }))

  return (
    <Animated.View
      // Reanimated views can be flattened away on Android, which breaks the animation
      collapsable={false}
      style={animatedStyle}
    >
      {children}
    </Animated.View>
  )
}

export function ReanimatedTransitionExample() {
  return (
    <ToastProvider transition={ReanimatedTransition}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Button title="Show toast" onPress={() => toast.show({ title: 'Saved' })} />
      </View>
    </ToastProvider>
  )
}
