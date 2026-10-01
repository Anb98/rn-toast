import { Button, Image, Text, View } from 'react-native'
import { createToast } from '@anb98/rn-toast'

interface MessagePayload {
  avatarUrl: string
}

const { ToastProvider, toast } = createToast<MessagePayload>()

export function CustomPayloadExample() {
  return (
    <ToastProvider
      icon={({ toast: { payload } }) =>
        payload ? (
          <Image
            source={{ uri: payload.avatarUrl }}
            style={{ width: 32, height: 32, borderRadius: 16 }}
          />
        ) : null
      }
    >
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Button
          title="New message"
          onPress={() =>
            toast.show({
              title: 'Ada Lovelace',
              description: 'Sent you a message',
              payload: { avatarUrl: 'https://example.com/ada.png' }
            })
          }
        />
      </View>
    </ToastProvider>
  )
}

export function CustomPayloadRenderToast() {
  return (
    <ToastProvider
      renderToast={({ toast: { title, payload } }) => (
        <View style={{ padding: 12, backgroundColor: '#111827', borderRadius: 10 }}>
          <Text style={{ color: 'white' }}>{title}</Text>
          {payload ? <Text style={{ color: 'white' }}>{payload.avatarUrl}</Text> : null}
        </View>
      )}
    >
      <View style={{ flex: 1 }} />
    </ToastProvider>
  )
}
