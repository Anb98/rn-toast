import { useEffect, useRef } from 'react'
import { Animated, Button, View } from 'react-native'
import { ToastProvider, toast } from '@anb98/rn-toast'
import type { ToastTransitionProps } from '@anb98/rn-toast'

const DURATION = 250

export function FadeSlideTransition({ phase, onExited, children }: ToastTransitionProps) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const exiting = phase === 'exiting'
    const animation = Animated.timing(progress, {
      toValue: exiting ? 0 : 1,
      duration: DURATION,
      useNativeDriver: true
    })
    animation.start(({ finished }) => {
      if (exiting && finished) onExited()
    })
    return () => animation.stop()
  }, [phase, progress, onExited])

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] })

  return (
    <Animated.View style={{ opacity: progress, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  )
}

export function AnimatedTransitionExample() {
  return (
    <ToastProvider transition={FadeSlideTransition}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Button title="Show toast" onPress={() => toast.show({ title: 'Saved' })} />
      </View>
    </ToastProvider>
  )
}
