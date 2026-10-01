import type { ComponentType } from 'react'

import { createToast } from '../createToast'
import * as library from '../index'
import { toast, ToastProvider } from '../index'
// @ts-expect-error
import type { ToastStore } from '../index'
import type {
  QueueStrategy,
  ToastDefaults,
  ToastOptions,
  ToastSlot,
  ToastTransitionProps,
  ToastVariant
} from '../types'

declare module '../types' {
  interface ToastVariants {
    brand: true
  }
}

interface UserPayload {
  userId: string
}

describe('public types', () => {
  it('types the payload at the options level', () => {
    const options: ToastOptions<UserPayload> = {
      title: 'Saved',
      payload: { userId: 'u' }
    }

    // @ts-expect-error
    const wrongPayload: ToastOptions<UserPayload> = { title: 'Saved', payload: { userId: 1 } }

    expect(options.payload?.userId).toBe('u')
    expect(wrongPayload.title).toBe('Saved')
  })

  it('requires a title', () => {
    // @ts-expect-error
    const missingTitle: ToastOptions<never> = {}

    expect(missingTitle).toEqual({})
  })

  it('accepts merged custom variants and rejects unknown ones', () => {
    const brand: ToastVariant = 'brand'

    // @ts-expect-error
    const unknown: ToastVariant = 'nope'

    expect([brand, unknown]).toEqual(['brand', 'nope'])
  })

  it('rejects options that the library does not offer', () => {
    const options: ToastOptions<never> = {
      title: 't',
      // @ts-expect-error
      position: 'bottom'
    }
    const cancelable: ToastOptions<never> = {
      title: 't',
      // @ts-expect-error
      cancelable: true
    }
    const styled: ToastOptions<never> = {
      title: 't',
      // @ts-expect-error
      className: 'p-4'
    }
    const themed: ToastOptions<never> = {
      title: 't',
      // @ts-expect-error
      theme: 'dark'
    }

    expect([options, cancelable, styled, themed]).toHaveLength(4)
  })

  it('accepts transitions that take fewer props and rejects incompatible ones', () => {
    const fewerProps: ComponentType<ToastTransitionProps> = () => null
    const inDefaults: ToastDefaults<never> = { transition: () => null }
    const incompatible: ToastDefaults<never> = {
      // @ts-expect-error
      transition: (props: { foo: string }) => (props.foo ? null : null)
    }

    expect(typeof fewerProps).toBe('function')
    expect(typeof inDefaults.transition).toBe('function')
    expect(typeof incompatible.transition).toBe('function')
  })

  it('types variant defaults by registered variant', () => {
    const variants: Partial<Record<ToastVariant, ToastDefaults<never>>> = {
      brand: { duration: 1000 },
      error: { duration: Infinity }
    }
    const unknownVariant: Partial<Record<ToastVariant, ToastDefaults<never>>> = {
      // @ts-expect-error
      nope: {}
    }

    expect(variants.brand?.duration).toBe(1000)
    expect(unknownVariant).toEqual({ nope: {} })
  })

  it('types the slot context payload', () => {
    const slot: ToastSlot<UserPayload> = ({ toast }) => toast.payload?.userId ?? null
    // @ts-expect-error
    const badSlot: ToastSlot<UserPayload> = ({ toast }) => toast.payload?.nope

    const context = {
      toast: {
        id: 'a',
        phase: 'visible' as const,
        title: 't',
        description: undefined,
        variant: 'info' as const,
        action: undefined,
        payload: { userId: 'u' }
      },
      dismiss: () => undefined,
      pressAction: () => Promise.resolve()
    }

    expect(slot(context)).toBe('u')
    expect(typeof badSlot).toBe('function')
  })
})

describe('instance types', () => {
  const payloadInstance = createToast<UserPayload>()

  it('types the payload on an instance', () => {
    const id = payloadInstance.toast.show({ title: 'Saved', payload: { userId: 'u' } })

    const wrongPayload = () =>
      payloadInstance.toast.show({
        title: 'Saved',
        // @ts-expect-error
        payload: { userId: 1 }
      })

    expect(id).toEqual(expect.any(String))
    expect(typeof wrongPayload).toBe('function')
  })

  it('rejects a payload on the default instance', () => {
    const withPayload = () =>
      toast.show({
        title: 't',
        // @ts-expect-error
        payload: 1
      })

    expect(toast.show({ title: 't' })).toEqual(expect.any(String))
    expect(typeof withPayload).toBe('function')
  })

  it('types the slot context payload inside provider variants', () => {
    const { ToastProvider: Provider } = payloadInstance
    const valid = (
      <Provider
        variants={{ error: { renderToast: ({ toast: record }) => record.payload?.userId ?? null } }}
      >
        {null}
      </Provider>
    )
    const invalid = (
      <Provider
        variants={{
          // @ts-expect-error
          error: { renderToast: ({ toast: record }) => record.payload?.nope }
        }}
      >
        {null}
      </Provider>
    )

    expect(valid.props.variants?.error?.renderToast).toBeInstanceOf(Function)
    expect(invalid.props.children).toBeNull()
  })

  it('accepts registered variants and rejects unknown ones on show', () => {
    const brand = toast.show({ title: 't', variant: 'brand' })

    const unknown = () =>
      toast.show({
        title: 't',
        // @ts-expect-error
        variant: 'nope'
      })

    expect(brand).toEqual(expect.any(String))
    expect(typeof unknown).toBe('function')
  })

  it('rejects misuse of the imperative api', () => {
    const misuse = () => {
      // @ts-expect-error
      toast.show({})
      // @ts-expect-error
      toast.dismiss(1)
      // @ts-expect-error
      toast.update('a')
    }

    expect(typeof misuse).toBe('function')
  })

  it('rejects unknown variants on the provider', () => {
    const element = (
      // @ts-expect-error
      <ToastProvider variants={{ nope: {} }}>{null}</ToastProvider>
    )

    expect(element.props.children).toBeNull()
  })

  it('does not let a queue strategy widen the payload type', () => {
    const unknownQueue: QueueStrategy<unknown> = { select: () => ({ activate: [] }) }
    const instance = createToast({ queue: unknownQueue })

    const withPayload = () =>
      instance.toast.show({
        title: 't',
        // @ts-expect-error
        payload: 1
      })

    expect(instance.toast.show({ title: 't' })).toEqual(expect.any(String))
    expect(typeof withPayload).toBe('function')
  })

  it('keeps the store internal', () => {
    const exported: readonly string[] = Object.keys(library)

    expect(exported).not.toContain('ToastStore')
  })

  it('offers no position, cancelable, className or theme on show', () => {
    const extras = () => {
      // @ts-expect-error
      toast.show({ title: 't', position: 'bottom' })
      // @ts-expect-error
      toast.show({ title: 't', cancelable: true })
      // @ts-expect-error
      toast.show({ title: 't', className: 'p-4' })
      // @ts-expect-error
      toast.show({ title: 't', theme: 'dark' })
    }

    expect(typeof extras).toBe('function')
  })
})
