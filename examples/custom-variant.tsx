import { Button, View } from 'react-native'
import { ToastProvider, toast } from '@anb98/rn-toast'

declare module '@anb98/rn-toast' {
  interface ToastVariants {
    brand: true
  }
}

export function CustomVariantExample() {
  return (
    <ToastProvider
      variants={{
        brand: {
          containerStyle: { backgroundColor: '#4F46E5' },
          titleStyle: { fontWeight: '700' },
          duration: 5000
        }
      }}
    >
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Button
          title="Show brand toast"
          onPress={() => toast.show({ title: 'Welcome aboard', variant: 'brand' })}
        />
      </View>
    </ToastProvider>
  )
}
