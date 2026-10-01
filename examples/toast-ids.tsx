import { Button, View } from 'react-native'
import { ToastProvider, toast } from '@anb98/rn-toast'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function uploadPhoto() {
  const id = toast.show({ title: 'Uploading photo...', duration: Infinity })
  await wait(2000)
  toast.dismiss(id)
}

async function uploadWithProgress() {
  const id = toast.show({ title: 'Uploading 0%', duration: Infinity })
  for (const progress of [25, 50, 75, 100]) {
    await wait(500)
    toast.update(id, { title: `Uploading ${progress}%` })
  }
  toast.update(id, { title: 'Upload complete', variant: 'success', duration: 3000 })
}

function reportOffline() {
  toast.show({ id: 'offline', title: 'No connection', variant: 'error' })
}

function failTenRequests() {
  for (let request = 0; request < 10; request++) reportOffline()
}

export function ToastIdsExample() {
  return (
    <ToastProvider>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Button title="Upload, then dismiss" onPress={uploadPhoto} />
        <Button title="Upload with progress" onPress={uploadWithProgress} />
        <Button title="Fail 10 requests (shows one toast)" onPress={failTenRequests} />
      </View>
    </ToastProvider>
  )
}
