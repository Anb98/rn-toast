/// <reference types="node" />
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text } from 'react-native'

import { createToast } from '../createToast'
import * as library from '../index'
import { PassthroughTransition } from '../Toast'
import type {
  QueueState,
  QueueStrategy,
  ToastInstance,
  ToastProviderProps,
  ToastTransitionProps
} from '../types'

const setDev = (value: boolean) => {
  Object.defineProperty(globalThis, '__DEV__', { value, configurable: true, writable: true })
}

const recordingQueue = () => {
  const states: QueueState<unknown>[] = []
  const strategy: QueueStrategy = {
    select: (state) => {
      states.push(state)
      const [first] = state.pending
      return { activate: state.occupying.length === 0 && first ? [first.id] : [] }
    }
  }
  const lastOccupying = () => states[states.length - 1]?.occupying.map((t) => t.phase)
  const sawExiting = (from = 0) =>
    states.slice(from).some((state) => state.occupying.some((t) => t.phase === 'exiting'))
  return { strategy, states, lastOccupying, sawExiting }
}

type ProviderOptions = Omit<ToastProviderProps<never>, 'children'>

const mount = (instance: ToastInstance<never>, props: ProviderOptions = {}) =>
  render(
    <instance.ToastProvider {...props}>
      <Text testID='app'>app</Text>
    </instance.ToastProvider>
  )

const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms))

const run = (action: () => void) => act(() => void action())

afterEach(() => {
  setDev(true)
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('createToast factory', () => {
  it('returns the provider, the hook and the imperative api', () => {
    const instance = createToast()
    expect(Object.keys(instance).sort()).toEqual(['ToastProvider', 'toast', 'useToast'])
    expect(Object.keys(instance.toast).sort()).toEqual([
      'clear',
      'dismiss',
      'promise',
      'show',
      'update'
    ])
  })

  it('show returns a string id, honoring an explicit id', () => {
    const { toast } = createToast()
    expect(typeof toast.show({ title: 'Hi' })).toBe('string')
    expect(toast.show({ title: 'Hi', id: 'fixed' })).toBe('fixed')
  })

  it('gives each instance its own queue', () => {
    const first = recordingQueue()
    const second = recordingQueue()
    const one = createToast({ queue: first.strategy })
    createToast({ queue: second.strategy })
    one.toast.show({ title: 'X' })
    expect(first.states).toHaveLength(1)
    expect(second.states).toHaveLength(0)
  })

  it('runs the configured queue strategy with occupying and pending records', () => {
    const queue = recordingQueue()
    const { toast } = createToast({ queue: queue.strategy })
    const id = toast.show({ title: 'A' })
    expect(queue.states[0]).toEqual({
      occupying: [],
      pending: [expect.objectContaining({ id, title: 'A', phase: 'queued' })]
    })
    toast.show({ title: 'B' })
    const second = queue.states[1]
    expect(second?.occupying).toEqual([expect.objectContaining({ id, phase: 'entering' })])
    expect(second?.pending).toEqual([expect.objectContaining({ title: 'B', phase: 'queued' })])
  })
})

describe('exitTimeout option', () => {
  const Stalled = () => null

  const mountedInstance = (exitTimeout: number | undefined) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const queue = recordingQueue()
    const instance = createToast({ queue: queue.strategy, exitTimeout })
    mount(instance, { transition: Stalled })
    return { ...instance, queue, warn }
  }

  it('releases a stalled exiting toast after the configured timeout', () => {
    jest.useFakeTimers()
    const { toast, queue, warn } = mountedInstance(250)
    run(() => toast.show({ id: 'a', title: 'A' }))
    run(() => toast.dismiss('a'))
    expect(queue.lastOccupying()).toEqual(['exiting'])
    advance(249)
    expect(queue.lastOccupying()).toEqual(['exiting'])
    advance(1)
    expect(queue.lastOccupying()).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"a"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('250 ms'))
  })

  it('uses the default timeout of 1000 ms when none is given', () => {
    jest.useFakeTimers()
    const { toast, queue, warn } = mountedInstance(undefined)
    run(() => toast.show({ id: 'a', title: 'A' }))
    run(() => toast.dismiss('a'))
    advance(999)
    expect(queue.lastOccupying()).toEqual(['exiting'])
    expect(warn).not.toHaveBeenCalled()
    advance(1)
    expect(queue.lastOccupying()).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1000 ms'))
  })

  it('rejects an invalid exitTimeout with one warning in development', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    createToast({ exitTimeout: -1 })
    expect(warn).toHaveBeenCalledTimes(1)
    createToast({ exitTimeout: 250 })
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('useToast', () => {
  const silenceReactErrors = () => jest.spyOn(console, 'error').mockImplementation(() => undefined)

  it('throws outside any provider', () => {
    silenceReactErrors()
    const { useToast } = createToast()
    expect(() => renderHook(() => useToast())).toThrow(/ToastProvider/)
  })

  it('throws inside the provider of another instance', () => {
    silenceReactErrors()
    const { useToast } = createToast()
    const other = createToast()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <other.ToastProvider>{children}</other.ToastProvider>
    )
    expect(() => renderHook(() => useToast(), { wrapper })).toThrow(/ToastProvider/)
  })

  it('returns the stable api inside its own provider', () => {
    const { useToast, ToastProvider, toast } = createToast()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    )
    const { result } = renderHook(() => useToast(), { wrapper })
    expect(result.current).toBe(toast)
    expect(typeof result.current.show).toBe('function')
    expect(typeof result.current.promise).toBe('function')
  })

  it('shares one store with the imperative api', () => {
    const queue = recordingQueue()
    const { useToast, ToastProvider, toast } = createToast({ queue: queue.strategy })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    )
    const { result } = renderHook(() => useToast(), { wrapper })
    let id = ''
    act(() => {
      id = toast.show({ title: 'A' })
    })
    expect(queue.sawExiting()).toBe(false)
    act(() => result.current.dismiss(id))
    expect(queue.sawExiting()).toBe(true)
  })
})

describe('ToastProvider', () => {
  it('renders children inside a flex root view', () => {
    const { ToastProvider } = createToast()
    render(
      <ToastProvider>
        <Text testID='child'>app</Text>
      </ToastProvider>
    )
    expect(screen.toJSON()).toMatchObject({
      props: { style: { flex: 1 } },
      children: [{ props: { testID: 'child' } }]
    })
  })

  it('attaches as a host while mounted and detaches on unmount', () => {
    const queue = recordingQueue()
    const instance = createToast({ queue: queue.strategy })
    const view = mount(instance)
    run(() => instance.toast.show({ id: 'a', title: 'A' }))
    run(() => instance.toast.dismiss('a'))
    expect(queue.sawExiting()).toBe(true)

    view.unmount()
    const before = queue.states.length
    instance.toast.show({ id: 'b', title: 'B' })
    instance.toast.dismiss('b')
    expect(queue.states.length).toBeGreaterThan(before)
    expect(queue.sawExiting(before)).toBe(false)
  })

  it('keeps an unhosted toast entering until a provider mounts', () => {
    jest.useFakeTimers()
    const queue = recordingQueue()
    const instance = createToast({ queue: queue.strategy })
    instance.toast.show({ id: 'early', title: 'early' })
    jest.advanceTimersByTime(60_000)
    instance.toast.show({ title: 'probe' })
    expect(queue.lastOccupying()).toEqual(['entering'])
    mount(instance)
    run(() => instance.toast.dismiss('early'))
    expect(queue.sawExiting()).toBe(true)
  })

  it('does not fail or leave timers when shown after the provider unmounted', () => {
    jest.useFakeTimers()
    const { ToastProvider, toast } = createToast()
    render(
      <ToastProvider>
        <Text>app</Text>
      </ToastProvider>
    ).unmount()
    expect(() => toast.dismiss(toast.show({ title: 'late' }))).not.toThrow()
    expect(jest.getTimerCount()).toBe(0)
  })
})

const wrapperStyle = () => StyleSheet.flatten(screen.getByTestId('toast').props.style)

describe('rendering', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  describe('overlay', () => {
    it('renders nothing while no toast is active', () => {
      mount(createToast())
      expect(screen.queryByTestId('toast-overlay')).toBeNull()
      expect(screen.queryByTestId('toast')).toBeNull()
    })

    it('renders the overlay after the children with layering and touch passthrough props', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi' }))
      const overlay = screen.getByTestId('toast-overlay')
      expect(overlay.props.pointerEvents).toBe('box-none')
      expect(StyleSheet.flatten(overlay.props.style)).toMatchObject({
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        elevation: 1000
      })
      expect(screen.toJSON()).toMatchObject({
        children: [{ props: { testID: 'app' } }, { props: { testID: 'toast-overlay' } }]
      })
    })

    it('wraps each toast in a box-none, unflattened view', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi' }))
      const wrapper = screen.getByTestId('toast')
      expect(wrapper.props.pointerEvents).toBe('box-none')
      expect(wrapper.props.collapsable).toBe(false)
    })

    it('works without a SafeAreaProvider through the default instance', () => {
      render(
        <library.ToastProvider>
          <Text>app</Text>
        </library.ToastProvider>
      )
      run(() => library.toast.show({ title: 'Hi' }))
      expect(screen.getByText('Hi')).toBeTruthy()
    })
  })

  describe('isolation and host stack', () => {
    it('shows a toast only in the provider of its own instance', () => {
      const first = createToast()
      const second = createToast()
      render(
        <first.ToastProvider>
          <second.ToastProvider>
            <Text>app</Text>
          </second.ToastProvider>
        </first.ToastProvider>
      )
      run(() => first.toast.show({ title: 'Hi' }))
      expect(screen.getAllByText('Hi')).toHaveLength(1)
      expect(screen.getAllByTestId('toast-overlay')).toHaveLength(1)
      run(() => second.toast.show({ title: 'Other' }))
      expect(screen.getByText('Other')).toBeTruthy()
      expect(screen.getAllByTestId('toast-overlay')).toHaveLength(2)
    })

    it('lets the last mounted provider render the overlay and the root resume after it unmounts', () => {
      const instance = createToast()
      const tree = (nested: boolean) => (
        <instance.ToastProvider>
          <Text testID='root-child'>root</Text>
          {nested ? (
            <instance.ToastProvider>
              <Text testID='nested-child'>nested</Text>
            </instance.ToastProvider>
          ) : null}
        </instance.ToastProvider>
      )
      const view = render(tree(false))
      view.rerender(tree(true))
      run(() => instance.toast.show({ title: 'Hi' }))
      expect(screen.getAllByTestId('toast-overlay')).toHaveLength(1)
      expect(screen.toJSON()).toMatchObject({
        children: [
          { props: { testID: 'root-child' } },
          {
            children: [{ props: { testID: 'nested-child' } }, { props: { testID: 'toast-overlay' } }]
          }
        ]
      })

      view.rerender(tree(false))
      expect(screen.getAllByText('Hi')).toHaveLength(1)
      expect(screen.toJSON()).toMatchObject({
        children: [{ props: { testID: 'root-child' } }, { props: { testID: 'toast-overlay' } }]
      })
    })
  })

  describe('lifecycle on screen', () => {
    it('renders a toast shown before any provider mounted, timing from mount', () => {
      const instance = createToast()
      instance.toast.show({ title: 'early' })
      advance(10_000)
      mount(instance)
      expect(screen.getByText('early')).toBeTruthy()
      advance(2999)
      expect(screen.getByText('early')).toBeTruthy()
      advance(1)
      expect(screen.queryByText('early')).toBeNull()
    })

    it('is already visible after show with the passthrough transition', () => {
      const instance = createToast()
      mount(instance)
      run(() =>
        instance.toast.show({
          title: 'Hi',
          renderTitle: ({ toast }) => <Text testID='phase'>{toast.phase}</Text>
        })
      )
      expect(screen.getByTestId('phase').props.children).toBe('visible')
    })

    it('frees the slot instantly on dismiss with the passthrough transition', () => {
      const instance = createToast()
      mount(instance)
      run(() => {
        instance.toast.show({ id: 'a', title: 'A' })
        instance.toast.show({ id: 'b', title: 'B' })
      })
      expect(screen.queryByText('B')).toBeNull()
      run(() => instance.toast.dismiss('a'))
      expect(screen.queryByText('A')).toBeNull()
      expect(screen.getByText('B')).toBeTruthy()
    })

    it('dismisses after the library default duration', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi' }))
      advance(2999)
      expect(screen.getByText('Hi')).toBeTruthy()
      advance(1)
      expect(screen.queryByText('Hi')).toBeNull()
    })

    it('honors a per-call duration', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi', duration: 500 }))
      advance(499)
      expect(screen.getByText('Hi')).toBeTruthy()
      advance(1)
      expect(screen.queryByText('Hi')).toBeNull()
    })

    it('expires a non-dismissible toast too', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi', dismissible: false }))
      expect(screen.getByText('Hi')).toBeTruthy()
      advance(3000)
      expect(screen.queryByText('Hi')).toBeNull()
    })

    it('starts the next toast timer when it appears, not when the previous one was shown', () => {
      const instance = createToast()
      mount(instance)
      run(() => {
        instance.toast.show({ id: 'a', title: 'A' })
        instance.toast.show({ id: 'b', title: 'B' })
      })
      advance(1000)
      run(() => instance.toast.dismiss('a'))
      advance(2999)
      expect(screen.getByText('B')).toBeTruthy()
      advance(1)
      expect(screen.queryByText('B')).toBeNull()
    })

    it('leaves no timers behind when the provider unmounts', () => {
      const instance = createToast()
      const view = mount(instance)
      run(() => instance.toast.show({ title: 'Hi' }))
      expect(jest.getTimerCount()).toBeGreaterThan(0)
      view.unmount()
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  describe('provider defaults', () => {
    it('applies the provider duration to toasts', () => {
      const instance = createToast()
      mount(instance, { duration: 1000 })
      run(() => instance.toast.show({ title: 'Hi' }))
      advance(999)
      expect(screen.getByText('Hi')).toBeTruthy()
      advance(1)
      expect(screen.queryByText('Hi')).toBeNull()
    })

    it('picks up an updated provider duration at the next timer start', () => {
      const instance = createToast()
      const view = mount(instance, { duration: 1000 })
      run(() => {
        instance.toast.show({ id: 'a', title: 'A' })
        instance.toast.show({ id: 'b', title: 'B' })
      })
      view.rerender(
        <instance.ToastProvider duration={5000}>
          <Text testID='app'>app</Text>
        </instance.ToastProvider>
      )
      run(() => instance.toast.dismiss('a'))
      advance(4999)
      expect(screen.getByText('B')).toBeTruthy()
      advance(1)
      expect(screen.queryByText('B')).toBeNull()
    })
  })

  describe('layout', () => {
    it('uses the default offsets with zero insets', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi' }))
      expect(wrapperStyle()).toMatchObject({ marginTop: 20, marginLeft: 12, marginRight: 12 })
    })

    it('adds provider insets to the offsets', () => {
      const instance = createToast()
      mount(instance, { insets: { top: 44, left: 10, right: 10 } })
      run(() => instance.toast.show({ title: 'Hi' }))
      expect(wrapperStyle()).toMatchObject({ marginTop: 64, marginLeft: 22, marginRight: 22 })
    })

    it('lets a per-call offset and insets override the provider', () => {
      const instance = createToast()
      mount(instance, { offset: 20, insets: { top: 44 } })
      run(() => instance.toast.show({ title: 'Hi', offset: 0, insets: { top: 50 } }))
      expect(wrapperStyle().marginTop).toBe(50)
    })

    it('applies landscape side insets on both sides', () => {
      const instance = createToast()
      mount(instance, { insets: { left: 47, right: 47 } })
      run(() => instance.toast.show({ title: 'Hi' }))
      expect(wrapperStyle()).toMatchObject({ marginLeft: 59, marginRight: 59 })
    })

    it('uses physical margins only and ignores the bottom inset', () => {
      const instance = createToast()
      mount(instance, { insets: { top: 10, bottom: 34 } })
      run(() => instance.toast.show({ title: 'Hi' }))
      const style = wrapperStyle()
      expect(style).not.toHaveProperty('start')
      expect(style).not.toHaveProperty('end')
      expect(style).not.toHaveProperty('top')
      expect(style).not.toHaveProperty('marginBottom')
      expect(style.marginTop).toBe(30)
    })

    it('gives a second active toast only the offset as top margin', () => {
      const queue: QueueStrategy = {
        select: ({ occupying, pending }) => ({
          activate: pending.slice(0, Math.max(0, 2 - occupying.length)).map((t) => t.id)
        })
      }
      const instance = createToast({ queue })
      mount(instance, { insets: { top: 44 } })
      run(() => {
        instance.toast.show({ id: 'a', title: 'A' })
        instance.toast.show({ id: 'b', title: 'B' })
      })
      const [first, second] = screen.getAllByTestId('toast')
      expect(StyleSheet.flatten(first?.props.style).marginTop).toBe(64)
      expect(StyleSheet.flatten(second?.props.style).marginTop).toBe(20)
    })
  })
})

describe('customization', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  const showing = (props: ProviderOptions, options: Parameters<ToastInstance<never>['toast']['show']>[0]) => {
    const instance = createToast()
    mount(instance, props)
    run(() => instance.toast.show(options))
    return instance
  }

  describe('renderToast', () => {
    it('replaces the whole default view inside the toast wrapper', () => {
      showing({}, { title: 'Hi', renderToast: ({ toast }) => <Text testID='custom'>{toast.title}</Text> })
      expect(screen.getByTestId('custom').props.children).toBe('Hi')
      expect(screen.queryByTestId('toast-container')).toBeNull()
      expect(screen.queryByTestId('toast-title')).toBeNull()
      expect(screen.getByTestId('custom').parent?.props.testID).not.toBe('toast-container')
      expect(screen.getByTestId('toast-overlay')).toBeTruthy()
    })

    it('hands the custom view a working dismiss', () => {
      showing(
        {},
        {
          title: 'Hi',
          renderToast: ({ dismiss }) => (
            <Text testID='custom' onPress={dismiss}>
              bye
            </Text>
          )
        }
      )
      act(() => screen.getByTestId('custom').props.onPress())
      expect(screen.queryByTestId('custom')).toBeNull()
    })

    it('can be set on the provider and overridden per call', () => {
      const instance = createToast()
      mount(instance, { renderToast: () => <Text testID='from-provider'>p</Text> })
      run(() => instance.toast.show({ id: 'a', title: 'A' }))
      expect(screen.getByTestId('from-provider')).toBeTruthy()
      run(() => instance.toast.dismiss('a'))
      run(() =>
        instance.toast.show({ title: 'B', renderToast: () => <Text testID='from-call'>c</Text> })
      )
      expect(screen.getByTestId('from-call')).toBeTruthy()
      expect(screen.queryByTestId('from-provider')).toBeNull()
    })
  })

  describe('part slots', () => {
    it.each([
      ['provider', { renderTitle: () => <Text testID='slot'>slot</Text> }, {}],
      ['variant', {}, { error: { renderTitle: () => <Text testID='slot'>slot</Text> } }],
      ['call', {}, {}]
    ] as const)('applies renderTitle from the %s level', (level, providerSlots, variants) => {
      showing(
        { ...providerSlots, variants },
        level === 'call'
          ? { title: 'Hi', variant: 'error', renderTitle: () => <Text testID='slot'>slot</Text> }
          : { title: 'Hi', variant: 'error' }
      )
      expect(screen.getByTestId('slot').props.children).toBe('slot')
      expect(screen.queryByTestId('toast-title')).toBeNull()
    })

    it('applies renderDescription and renderAction from the provider', () => {
      showing(
        {
          renderDescription: () => <Text testID='d'>d</Text>,
          renderAction: () => <Text testID='a'>a</Text>
        },
        { title: 'Hi', description: 'desc', action: { label: 'Undo', onPress: jest.fn() } }
      )
      expect(screen.getByTestId('d')).toBeTruthy()
      expect(screen.getByTestId('a')).toBeTruthy()
      expect(screen.queryByTestId('toast-description')).toBeNull()
      expect(screen.queryByTestId('toast-action')).toBeNull()
    })

    it('picks the call slot over the variant slot over the provider slot', () => {
      const slot = (label: string) => () => <Text testID='slot'>{label}</Text>
      const variants = { error: { renderTitle: slot('B') } }

      const instance = createToast()
      mount(instance, { renderTitle: slot('A'), variants })
      run(() => instance.toast.show({ id: 'a', title: 'x' }))
      expect(screen.getByTestId('slot').props.children).toBe('A')
      run(() => instance.toast.dismiss('a'))
      run(() => instance.toast.show({ id: 'b', title: 'x', variant: 'error' }))
      expect(screen.getByTestId('slot').props.children).toBe('B')
      run(() => instance.toast.dismiss('b'))
      run(() => instance.toast.show({ title: 'x', variant: 'error', renderTitle: slot('C') }))
      expect(screen.getByTestId('slot').props.children).toBe('C')
    })
  })

  describe('icon and variants', () => {
    it('renders an icon configured on a variant', () => {
      showing(
        { variants: { error: { icon: <Text testID='e'>e</Text> } } },
        { title: 'Hi', variant: 'error' }
      )
      expect(screen.getByTestId('e', { includeHiddenElements: true }).props.children).toBe('e')
    })

    it('defaults the record variant to info', () => {
      showing({}, { title: 'Hi', renderTitle: ({ toast }) => <Text testID='v'>{toast.variant}</Text> })
      expect(screen.getByTestId('v').props.children).toBe('info')
    })

    it('styles a registered custom variant through the variants prop', () => {
      showing(
        { variants: { brand: { containerStyle: { backgroundColor: 'purple' } } } },
        { title: 'Hi', variant: 'brand' }
      )
      expect(StyleSheet.flatten(screen.getByTestId('toast-container').props.style)).toMatchObject({
        backgroundColor: 'purple'
      })
    })

    it('renders an unregistered variant with the base look', () => {
      showing({}, { title: 'Hi', variant: 'brand' })
      expect(StyleSheet.flatten(screen.getByTestId('toast-container').props.style)).toMatchObject({
        backgroundColor: '#08161FED'
      })
    })

    it('renders the built-in variants with their own colors', () => {
      showing({}, { title: 'Hi', variant: 'success' })
      expect(StyleSheet.flatten(screen.getByTestId('toast-container').props.style)).toMatchObject({
        backgroundColor: '#166534'
      })
    })
  })

  describe('styles', () => {
    it('merges provider and call title styles property by property', () => {
      showing(
        { titleStyle: { color: 'red', fontSize: 10 } },
        { title: 'Hi', titleStyle: { color: 'blue' } }
      )
      expect(StyleSheet.flatten(screen.getByTestId('toast-title').props.style)).toMatchObject({
        color: 'blue',
        fontSize: 10
      })
    })

    it('accepts array styles at every level', () => {
      showing(
        { containerStyle: [{ margin: 1 }, { padding: 30 }] },
        { title: 'Hi', containerStyle: [{ margin: 2 }] }
      )
      expect(StyleSheet.flatten(screen.getByTestId('toast-container').props.style)).toMatchObject({
        margin: 2,
        padding: 30
      })
    })

    it('puts variant styles under provider styles', () => {
      showing(
        {
          containerStyle: { borderRadius: 2 },
          variants: { error: { containerStyle: { borderRadius: 5, opacity: 0.5 } } }
        },
        { title: 'Hi', variant: 'error' }
      )
      expect(StyleSheet.flatten(screen.getByTestId('toast-container').props.style)).toMatchObject({
        borderRadius: 5,
        opacity: 0.5,
        backgroundColor: '#991B1B'
      })
    })

    it('uses no className on any rendered element', () => {
      showing({}, { title: 'Hi', description: 'd', action: { label: 'Undo', onPress: jest.fn() } })
      expect(JSON.stringify(screen.toJSON())).not.toContain('className')
    })
  })
})

describe('transitions', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  const spyTransition = () => {
    const calls: ToastTransitionProps[] = []
    const Spy = (props: ToastTransitionProps) => {
      calls.push(props)
      return <>{props.children}</>
    }
    const phases = () =>
      calls.map((call) => call.phase).filter((phase, i, all) => phase !== all[i - 1])
    return { Spy, calls, phases }
  }

  const delayedTransition = (delay: number) =>
    function Delayed({ phase, onExited, children }: ToastTransitionProps) {
      useEffect(() => {
        if (phase !== 'exiting') return undefined
        const timer = setTimeout(onExited, delay)
        return () => clearTimeout(timer)
      }, [phase, onExited])
      return <>{children}</>
    }

  const Stalled = ({ children }: ToastTransitionProps) => <>{children}</>

  const twoToasts = (instance: ToastInstance<never>) =>
    run(() => {
      instance.toast.show({ id: 'a', title: 'A' })
      instance.toast.show({ id: 'b', title: 'B' })
    })

  describe('contract', () => {
    it('passes phase, onExited, dismiss and the default view as children', () => {
      const { Spy, calls } = spyTransition()
      const instance = createToast()
      mount(instance, { transition: Spy })
      run(() => instance.toast.show({ title: 'Hi' }))
      const [first] = calls
      expect(first?.phase).toBe('entering')
      expect(typeof first?.onExited).toBe('function')
      expect(typeof first?.dismiss).toBe('function')
      expect(screen.getByTestId('toast-title').props.children).toBe('Hi')
      expect(screen.getByTestId('toast-container')).toBeTruthy()
    })

    it('renders entering with content mounted, then visible, then exiting', () => {
      const { Spy, phases } = spyTransition()
      const instance = createToast()
      mount(instance, { transition: Spy })
      run(() => instance.toast.show({ id: 'a', title: 'Hi' }))
      expect(phases()).toEqual(['entering', 'visible'])
      run(() => instance.toast.dismiss('a'))
      expect(phases()).toEqual(['entering', 'visible', 'exiting'])
    })

    it('starts the duration timer once visible', () => {
      const { Spy, phases } = spyTransition()
      const instance = createToast()
      mount(instance, { transition: Spy })
      run(() => instance.toast.show({ title: 'Hi' }))
      advance(2999)
      expect(phases()).toEqual(['entering', 'visible'])
      advance(1)
      expect(phases()).toEqual(['entering', 'visible', 'exiting'])
    })

    it('exits when the transition calls dismiss', () => {
      const { Spy, calls, phases } = spyTransition()
      const instance = createToast()
      mount(instance, { transition: Spy })
      run(() => instance.toast.show({ title: 'Hi' }))
      run(() => calls[calls.length - 1]?.dismiss())
      expect(phases()).toEqual(['entering', 'visible', 'exiting'])
    })
  })

  describe('precedence', () => {
    const labelled = (label: string) =>
      function Labelled({ children, ...props }: ToastTransitionProps) {
        return (
          <PassthroughTransition {...props}>
            <Text testID='transition'>{label}</Text>
            {children}
          </PassthroughTransition>
        )
      }

    it('prefers call, then variant, then provider', () => {
      const instance = createToast()
      mount(instance, {
        transition: labelled('provider'),
        variants: { error: { transition: labelled('variant') } }
      })
      run(() => instance.toast.show({ id: 'a', title: 'x' }))
      expect(screen.getByTestId('transition').props.children).toBe('provider')
      run(() => instance.toast.dismiss('a'))
      run(() => instance.toast.show({ id: 'b', title: 'x', variant: 'error' }))
      expect(screen.getByTestId('transition').props.children).toBe('variant')
      run(() => instance.toast.dismiss('b'))
      run(() =>
        instance.toast.show({
          id: 'c',
          title: 'x',
          variant: 'error',
          transition: labelled('call')
        })
      )
      expect(screen.getByTestId('transition').props.children).toBe('call')
    })
  })

  describe('slot hold', () => {
    it('keeps the exiting toast and delays the next one until onExited', () => {
      const instance = createToast()
      mount(instance, { transition: delayedTransition(300) })
      twoToasts(instance)
      run(() => instance.toast.dismiss('a'))
      advance(299)
      expect(screen.getByText('A')).toBeTruthy()
      expect(screen.queryByText('B')).toBeNull()
      advance(1)
      expect(screen.queryByText('A')).toBeNull()
      expect(screen.getByText('B')).toBeTruthy()
    })

    it('keeps a sticky toast until it is dismissed', () => {
      const instance = createToast()
      const { Spy, phases } = spyTransition()
      mount(instance, { transition: Spy })
      run(() => instance.toast.show({ id: 'a', title: 'A', duration: Infinity }))
      advance(10 * 60_000)
      expect(phases()).toEqual(['entering', 'visible'])
      run(() => instance.toast.dismiss('a'))
      expect(phases()).toEqual(['entering', 'visible', 'exiting'])
    })

    it('ignores a repeated onExited so the next toast is promoted once', () => {
      const exits: (() => void)[] = []
      const Twice = ({ phase, onExited, children }: ToastTransitionProps) => {
        useEffect(() => {
          if (phase === 'exiting') exits.push(onExited)
        }, [phase, onExited])
        return <>{children}</>
      }
      const instance = createToast()
      mount(instance, { transition: Twice })
      twoToasts(instance)
      run(() => instance.toast.dismiss('a'))
      run(() => {
        exits[0]?.()
        exits[0]?.()
      })
      expect(screen.getAllByText('B')).toHaveLength(1)
      expect(screen.queryByText('A')).toBeNull()
    })
  })

  describe('safety timeout', () => {
    it('releases the slot of a stalled transition and warns with the toast id', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      const instance = createToast()
      mount(instance, { transition: Stalled })
      twoToasts(instance)
      run(() => instance.toast.dismiss('a'))
      advance(999)
      expect(screen.getByText('A')).toBeTruthy()
      expect(warn).not.toHaveBeenCalled()
      advance(1)
      expect(screen.queryByText('A')).toBeNull()
      expect(screen.getByText('B')).toBeTruthy()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"a"'))
    })

    it('honors a configured exitTimeout', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      const instance = createToast({ exitTimeout: 250 })
      mount(instance, { transition: Stalled })
      twoToasts(instance)
      run(() => instance.toast.dismiss('a'))
      advance(249)
      expect(screen.getByText('A')).toBeTruthy()
      advance(1)
      expect(screen.queryByText('A')).toBeNull()
    })

    it('ignores an onExited that arrives after the timeout', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      let lateExit: (() => void) | undefined
      const Late = ({ phase, onExited, children }: ToastTransitionProps) => {
        useEffect(() => {
          if (phase === 'exiting') lateExit = onExited
        }, [phase, onExited])
        return <>{children}</>
      }
      const instance = createToast()
      mount(instance, { transition: Late })
      twoToasts(instance)
      run(() => instance.toast.dismiss('a'))
      advance(1000)
      expect(screen.getByText('B')).toBeTruthy()
      run(() => lateExit?.())
      expect(screen.getByText('B')).toBeTruthy()
      expect(screen.getAllByText('B')).toHaveLength(1)
    })

    it('does not warn when onExited arrives in time', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      const instance = createToast()
      mount(instance, { transition: delayedTransition(500) })
      twoToasts(instance)
      run(() => instance.toast.dismiss('a'))
      advance(500)
      expect(screen.getByText('B')).toBeTruthy()
      advance(2000)
      expect(warn).not.toHaveBeenCalled()
    })
  })
})

describe('actions and lifecycle callbacks', () => {
  const press = (testID: string) =>
    act(async () => {
      fireEvent.press(screen.getByTestId(testID))
    })

  const flushMacrotask = () => act(() => new Promise<void>((resolve) => setImmediate(resolve)))

  const spyOnUnhandledRejections = () => {
    const handler = jest.fn()
    process.on('unhandledRejection', handler)
    return { handler, stop: () => process.off('unhandledRejection', handler) }
  }

  const withAction = (
    onPress: () => void | Promise<void>,
    props: ProviderOptions = {},
    extra: Partial<Parameters<ToastInstance<never>['toast']['show']>[0]> = {}
  ) => {
    const instance = createToast()
    mount(instance, props)
    run(() =>
      instance.toast.show({ id: 'a', title: 'A', action: { label: 'Undo', onPress }, ...extra })
    )
    return instance
  }

  describe('action runner', () => {
    it('waits for the action to finish before dismissing', async () => {
      let finish: () => void = () => undefined
      const onPress = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)))
      withAction(onPress)
      await press('toast-action')
      expect(onPress).toHaveBeenCalledTimes(1)
      expect(screen.getByText('A')).toBeTruthy()
      await act(async () => finish())
      expect(screen.queryByText('A')).toBeNull()
    })

    it('dismisses after a synchronous action without reporting an error', async () => {
      const onError = jest.fn()
      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      withAction(jest.fn(), { onError })
      await press('toast-action')
      expect(screen.queryByText('A')).toBeNull()
      expect(onError).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    })

    it('reports a synchronous throw with the error and the toast record, then dismisses', async () => {
      const failure = new Error('sync')
      const onError = jest.fn()
      withAction(() => {
        throw failure
      }, {}, { onError })
      await press('toast-action')
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0]?.[0]).toBe(failure)
      expect(onError.mock.calls[0]?.[1]).toMatchObject({ id: 'a', title: 'A' })
      expect(screen.queryByText('A')).toBeNull()
    })

    it('reports an async rejection without an unhandled rejection, then dismisses', async () => {
      const failure = new Error('async')
      const onError = jest.fn()
      const rejections = spyOnUnhandledRejections()
      withAction(() => Promise.reject(failure), { onError })
      await press('toast-action')
      await flushMacrotask()
      rejections.stop()
      expect(onError).toHaveBeenCalledWith(failure, expect.objectContaining({ id: 'a' }))
      expect(rejections.handler).not.toHaveBeenCalled()
      expect(screen.queryByText('A')).toBeNull()
    })

    it('calls the per-toast handler before the Provider handler', async () => {
      const order: string[] = []
      withAction(
        () => {
          throw new Error('x')
        },
        { onError: () => order.push('provider') },
        { onError: () => order.push('toast') }
      )
      await press('toast-action')
      expect(order).toEqual(['toast', 'provider'])
    })

    it('calls only the Provider handler when the toast has none', async () => {
      const onError = jest.fn()
      withAction(() => Promise.reject(new Error('x')), { onError })
      await press('toast-action')
      expect(onError).toHaveBeenCalledTimes(1)
    })

    it('logs once in development when no handler exists and still dismisses', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      const failure = new Error('boom')
      withAction(() => Promise.reject(failure))
      await press('toast-action')
      expect(error).toHaveBeenCalledTimes(1)
      expect(error.mock.calls[0]).toContain(failure)
      expect(screen.queryByText('A')).toBeNull()
    })

    it('stays silent in production when no handler exists', async () => {
      setDev(false)
      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      withAction(() => Promise.reject(new Error('boom')))
      await press('toast-action')
      expect(error).not.toHaveBeenCalled()
      expect(screen.queryByText('A')).toBeNull()
    })

    it('still dismisses and never leaks when the error handler throws', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      const rejections = spyOnUnhandledRejections()
      const providerHandler = jest.fn()
      withAction(
        () => Promise.reject(new Error('x')),
        { onError: providerHandler },
        {
          onError: () => {
            throw new Error('handler')
          }
        }
      )
      await press('toast-action')
      await flushMacrotask()
      rejections.stop()
      expect(providerHandler).toHaveBeenCalledTimes(1)
      expect(error).toHaveBeenCalledTimes(1)
      expect(rejections.handler).not.toHaveBeenCalled()
      expect(screen.queryByText('A')).toBeNull()
    })

    it('ignores a second press while the first is in flight', async () => {
      let finish: () => void = () => undefined
      const onPress = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)))
      withAction(onPress)
      await press('toast-action')
      await press('toast-action')
      expect(onPress).toHaveBeenCalledTimes(1)
      await act(async () => finish())
      expect(screen.queryByText('A')).toBeNull()
    })

    it('hands the same runner to a custom renderAction', async () => {
      const onPress = jest.fn()
      const instance = createToast()
      mount(instance)
      run(() =>
        instance.toast.show({
          id: 'a',
          title: 'A',
          action: { label: 'Undo', onPress },
          renderAction: ({ pressAction }) => (
            <Pressable testID='custom-action' onPress={() => void pressAction()} />
          )
        })
      )
      await press('custom-action')
      expect(onPress).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('A')).toBeNull()
    })

    it('resolves pressAction without rejecting when the action fails', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined)
      let outcome: 'pending' | 'resolved' | 'rejected' = 'pending'
      const instance = createToast()
      mount(instance)
      run(() =>
        instance.toast.show({
          title: 'A',
          action: { label: 'Undo', onPress: () => Promise.reject(new Error('x')) },
          renderAction: ({ pressAction }) => (
            <Pressable
              testID='custom-action'
              onPress={() =>
                pressAction().then(
                  () => (outcome = 'resolved'),
                  () => (outcome = 'rejected')
                )
              }
            />
          )
        })
      )
      await press('custom-action')
      await flushMacrotask()
      expect(outcome).toBe('resolved')
    })

    it('does nothing for a toast without an action', async () => {
      const instance = createToast()
      mount(instance)
      run(() =>
        instance.toast.show({
          title: 'A',
          renderTitle: ({ pressAction }) => (
            <Pressable testID='bare' onPress={() => void pressAction()} />
          )
        })
      )
      await press('bare')
      expect(screen.getByTestId('toast')).toBeTruthy()
    })

    it('dismisses the entry key even when the action re-shows the same id', async () => {
      const instance = createToast()
      mount(instance)
      run(() =>
        instance.toast.show({
          id: 'a',
          title: 'A',
          action: {
            label: 'Undo',
            onPress: () => void instance.toast.show({ id: 'a', title: 'A2' })
          }
        })
      )
      await press('toast-action')
      expect(screen.queryByText('A2')).toBeNull()
      expect(screen.queryByTestId('toast')).toBeNull()
    })
  })

  describe('dismiss gestures', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it.each(['toast-content', 'toast-container'])('dismisses when %s is pressed', (testID) => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi' }))
      fireEvent.press(screen.getByTestId(testID))
      expect(screen.queryByText('Hi')).toBeNull()
    })

    it('keeps a non-dismissible toast visible when pressed', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi', dismissible: false }))
      fireEvent.press(screen.getByTestId('toast-content'))
      fireEvent.press(screen.getByTestId('toast-container'))
      expect(screen.getByText('Hi')).toBeTruthy()
    })

    it('dismisses a sticky toast on press after a long wait', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi', duration: Infinity }))
      advance(60_000)
      expect(screen.getByText('Hi')).toBeTruthy()
      fireEvent.press(screen.getByTestId('toast-content'))
      expect(screen.queryByText('Hi')).toBeNull()
    })

    it('dismisses on accessibility escape when dismissible', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi' }))
      const escape = screen.getByTestId('toast').props.onAccessibilityEscape
      expect(typeof escape).toBe('function')
      act(() => escape())
      expect(screen.queryByText('Hi')).toBeNull()
    })

    it('offers no accessibility escape when not dismissible', () => {
      const instance = createToast()
      mount(instance)
      run(() => instance.toast.show({ title: 'Hi', dismissible: false }))
      expect(screen.getByTestId('toast').props.onAccessibilityEscape).toBeUndefined()
    })
  })

  describe('lifecycle callbacks', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('fires onShow once after mount, per-toast first then the Provider', () => {
      const order: string[] = []
      const instance = createToast()
      mount(instance, { onShow: () => order.push('provider') })
      run(() => instance.toast.show({ title: 'Hi', onShow: () => order.push('toast') }))
      expect(order).toEqual(['toast', 'provider'])
      advance(1000)
      expect(order).toEqual(['toast', 'provider'])
    })

    it('fires onShow after a toast shown before mount once the Provider mounts', () => {
      const onShow = jest.fn()
      const instance = createToast()
      instance.toast.show({ title: 'early' })
      mount(instance, { onShow })
      expect(onShow).toHaveBeenCalledTimes(1)
      expect(onShow).toHaveBeenCalledWith(expect.objectContaining({ title: 'early' }))
    })

    it('fires onHide once per level on expiry, per-toast first', () => {
      const order: string[] = []
      const instance = createToast()
      mount(instance, { onHide: () => order.push('provider') })
      run(() => instance.toast.show({ title: 'Hi', onHide: () => order.push('toast') }))
      expect(order).toEqual([])
      advance(3000)
      expect(order).toEqual(['toast', 'provider'])
    })

    it('fires onHide once on a manual dismiss', () => {
      const onHide = jest.fn()
      const instance = createToast()
      mount(instance, { onHide })
      run(() => instance.toast.show({ id: 'a', title: 'Hi' }))
      run(() => instance.toast.dismiss('a'))
      run(() => instance.toast.dismiss('a'))
      expect(onHide).toHaveBeenCalledTimes(1)
    })

    it('fires only Provider callbacks when the toast defines none', () => {
      const onShow = jest.fn()
      const onHide = jest.fn()
      const instance = createToast()
      mount(instance, { onShow, onHide })
      run(() => instance.toast.show({ title: 'Hi' }))
      advance(3000)
      expect(onShow).toHaveBeenCalledTimes(1)
      expect(onHide).toHaveBeenCalledTimes(1)
    })

    it('passes the toast record with id, title, variant and payload', () => {
      const onShow = jest.fn()
      const onHide = jest.fn()
      const instance = createToast<{ userId: string }>()
      render(
        <instance.ToastProvider onShow={onShow} onHide={onHide}>
          <Text>app</Text>
        </instance.ToastProvider>
      )
      run(() =>
        instance.toast.show({
          id: 'a',
          title: 'Hi',
          variant: 'success',
          payload: { userId: 'u' }
        })
      )
      advance(3000)
      const expected = { id: 'a', title: 'Hi', variant: 'success', payload: { userId: 'u' } }
      expect(onShow.mock.calls[0]?.[0]).toMatchObject(expected)
      expect(onHide.mock.calls[0]?.[0]).toMatchObject(expected)
    })

    it('fires neither callback for a toast dismissed while queued', () => {
      const onShow = jest.fn()
      const onHide = jest.fn()
      const instance = createToast()
      mount(instance, { onShow, onHide })
      run(() => {
        instance.toast.show({ id: 'a', title: 'A' })
        instance.toast.show({ id: 'b', title: 'B' })
      })
      run(() => instance.toast.dismiss('b'))
      advance(3000)
      expect(onShow.mock.calls.map(([record]) => record.id)).toEqual(['a'])
      expect(onHide.mock.calls.map(([record]) => record.id)).toEqual(['a'])
    })

    it('keeps the queue moving when a callback throws', () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined)
      const instance = createToast()
      mount(instance, {
        onShow: () => {
          throw new Error('show')
        },
        onHide: () => {
          throw new Error('hide')
        }
      })
      run(() => {
        instance.toast.show({ id: 'a', title: 'A' })
        instance.toast.show({ id: 'b', title: 'B' })
      })
      expect(screen.getByText('A')).toBeTruthy()
      advance(3000)
      expect(screen.getByText('B')).toBeTruthy()
    })

    it('reads the latest Provider callbacks without re-registering', () => {
      const first = jest.fn()
      const second = jest.fn()
      const instance = createToast()
      const view = mount(instance, { onShow: first })
      view.rerender(
        <instance.ToastProvider onShow={second}>
          <Text>app</Text>
        </instance.ToastProvider>
      )
      run(() => instance.toast.show({ title: 'Hi' }))
      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledTimes(1)
    })
  })
})

describe('toast.promise', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  const deferred = <TValue,>() => {
    let resolve: (value: TValue) => void = () => undefined
    let reject: (reason: unknown) => void = () => undefined
    const promise = new Promise<TValue>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  const start = <TValue,>(
    api: ToastInstance<never>['toast'],
    promise: Promise<TValue>,
    messages: Parameters<typeof api.promise<TValue>>[1]
  ) => {
    let returned = promise
    act(() => {
      returned = api.promise(promise, messages)
    })
    return returned
  }

  const mounted = () => {
    const instance = createToast()
    mount(instance)
    return instance
  }

  const settleChain = (action: () => void) =>
    act(async () => {
      action()
      for (let tick = 0; tick < 5; tick++) await Promise.resolve()
    })

  it('shows the loading toast and keeps it sticky', () => {
    const { toast } = mounted()
    const { promise } = deferred<number>()
    run(() => void toast.promise(promise, { loading: 'Loading', success: 'Done', error: 'Failed' }))
    expect(screen.getByText('Loading')).toBeTruthy()
    advance(60_000)
    expect(screen.getByText('Loading')).toBeTruthy()
  })

  it('updates the same toast to success and dismisses after the default duration', async () => {
    const { toast } = mounted()
    const { promise, resolve } = deferred<number>()
    run(() => void toast.promise(promise, { loading: 'Loading', success: 'Done', error: 'Failed' }))
    await act(async () => resolve(1))
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.queryByText('Loading')).toBeNull()
    expect(screen.getAllByTestId('toast')).toHaveLength(1)
    advance(2999)
    expect(screen.getByText('Done')).toBeTruthy()
    advance(1)
    expect(screen.queryByText('Done')).toBeNull()
  })

  it('passes the resolved value to a success formatter and resolves with it', async () => {
    const { toast } = mounted()
    const { promise, resolve } = deferred<number>()
    const outcome = start(toast, promise, {
      loading: 'Loading',
      success: (value) => `got ${value}`,
      error: 'Failed'
    })
    await act(async () => resolve(42))
    expect(screen.getByText('got 42')).toBeTruthy()
    await expect(outcome).resolves.toBe(42)
  })

  it('updates to the error content and rejects the caller with the same reason', async () => {
    const { toast } = mounted()
    const { promise, reject } = deferred<number>()
    const failure = new Error('nope')
    const outcome = start(toast, promise, {
      loading: 'Loading',
      success: 'Done',
      error: (reason) => (reason instanceof Error ? `error(${reason.message})` : 'unknown')
    })
    const caught = outcome.catch((reason: unknown) => reason)
    await act(async () => reject(failure))
    expect(screen.getByText('error(nope)')).toBeTruthy()
    expect(await caught).toBe(failure)
  })

  it('uses static error content', async () => {
    const { toast } = mounted()
    const { promise, reject } = deferred<number>()
    const caught = start(toast, promise, { loading: 'Loading', success: 'Done', error: 'Failed' })
      .catch(() => undefined)
    await act(async () => reject(new Error('x')))
    await caught
    expect(screen.getByText('Failed')).toBeTruthy()
  })

  it('adds no unhandled rejection of its own', async () => {
    const handler = jest.fn()
    process.on('unhandledRejection', handler)
    jest.useRealTimers()
    const { toast } = mounted()
    const { promise, reject } = deferred<number>()
    const caught = start(toast, promise, { loading: 'Loading', success: 'Done', error: 'Failed' })
      .catch(() => undefined)
    await act(async () => reject(new Error('x')))
    await caught
    await act(() => new Promise<void>((resolve) => setImmediate(resolve)))
    process.off('unhandledRejection', handler)
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not revive a toast dismissed while loading and still resolves', async () => {
    const { toast } = mounted()
    const { promise, resolve } = deferred<number>()
    const outcome = start(toast, promise, {
      loading: 'Loading',
      success: 'Done',
      error: 'Failed'
    })
    run(() => toast.clear())
    expect(screen.queryByText('Loading')).toBeNull()
    await act(async () => resolve(7))
    expect(screen.queryByText('Done')).toBeNull()
    expect(screen.queryByTestId('toast')).toBeNull()
    await expect(outcome).resolves.toBe(7)
  })

  it('dismisses the toast and logs in development when a formatter throws', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { toast } = mounted()
    const { promise, resolve } = deferred<number>()
    const outcome = start(toast, promise, {
      loading: 'Loading',
      success: () => {
        throw new Error('format')
      },
      error: 'Failed'
    })
    await settleChain(() => resolve(1))
    expect(screen.queryByTestId('toast')).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)
    await expect(outcome).resolves.toBe(1)
  })

  it('stays silent in production when a formatter throws', async () => {
    setDev(false)
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { toast } = mounted()
    const { promise, resolve } = deferred<number>()
    start(toast, promise, {
      loading: 'Loading',
      success: () => {
        throw new Error('format')
      },
      error: 'Failed'
    })
    await settleChain(() => resolve(1))
    expect(screen.queryByTestId('toast')).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })

  it('keeps the loading toast sticky when loading.duration is explicitly undefined', () => {
    const { toast } = mounted()
    const { promise } = deferred<number>()
    run(
      () =>
        void toast.promise(promise, {
          loading: { title: 'Loading', duration: undefined },
          success: 'Done',
          error: 'Failed'
        })
    )
    advance(60_000)
    expect(screen.getByText('Loading')).toBeTruthy()
  })

  it('honors a finite loading.duration', () => {
    const { toast } = mounted()
    const { promise } = deferred<number>()
    run(
      () =>
        void toast.promise(promise, {
          loading: { title: 'Loading', duration: 500 },
          success: 'Done',
          error: 'Failed'
        })
    )
    advance(499)
    expect(screen.getByText('Loading')).toBeTruthy()
    advance(1)
    expect(screen.queryByText('Loading')).toBeNull()
  })

  it('accepts content objects for every stage', async () => {
    const { toast } = mounted()
    const { promise, resolve } = deferred<number>()
    run(
      () =>
        void toast.promise(promise, {
          loading: { title: 'Loading', description: 'please wait' },
          success: (value) => ({ title: 'Done', description: `value ${value}`, variant: 'success' }),
          error: 'Failed'
        })
    )
    expect(screen.getByText('please wait')).toBeTruthy()
    await act(async () => resolve(3))
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('value 3')).toBeTruthy()
    expect(screen.queryByText('please wait')).toBeNull()
  })

  it('returns the original promise', () => {
    const { toast } = mounted()
    const { promise } = deferred<number>()
    const returned = start(toast, promise, { loading: 'L', success: 'S', error: 'E' })
    expect(returned === promise).toBe(true)
  })
})

describe('accessibility', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  const announcements = (os: 'ios' | 'android') => {
    jest.replaceProperty(Platform, 'OS', os)
    return jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined)
      .mockClear()
  }

  const showing = (options: Parameters<ToastInstance<never>['toast']['show']>[0]) => {
    const instance = createToast()
    mount(instance)
    run(() => instance.toast.show({ id: 'a', ...options }))
    return instance
  }

  it.each(['ios', 'android'] as const)('marks the wrapper as a polite alert on %s', (os) => {
    jest.replaceProperty(Platform, 'OS', os)
    showing({ title: 'Hi' })
    const wrapper = screen.getByTestId('toast')
    expect(wrapper.props.accessibilityRole).toBe('alert')
    expect(wrapper.props.accessibilityLiveRegion).toBe('polite')
  })

  it('keeps the wrapper semantics and escape around a custom renderToast', () => {
    announcements('ios')
    showing({ title: 'Hi', renderToast: () => <Text>custom</Text> })
    const wrapper = screen.getByTestId('toast')
    expect(wrapper.props.accessibilityRole).toBe('alert')
    expect(wrapper.props.accessibilityLiveRegion).toBe('polite')
    expect(typeof wrapper.props.onAccessibilityEscape).toBe('function')
  })

  it('announces title and description once on iOS when the toast becomes visible', () => {
    const announce = announcements('ios')
    showing({ title: 'Saved', description: 'All changes stored' })
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('Saved. All changes stored')
  })

  it('announces only the title when there is no description', () => {
    const announce = announcements('ios')
    showing({ title: 'Saved' })
    expect(announce).toHaveBeenCalledWith('Saved')
  })

  it('does not announce again when an update keeps the same text', () => {
    const announce = announcements('ios')
    const instance = showing({ title: 'Saved', description: 'Stored' })
    run(() => instance.toast.update('a', { variant: 'success' }))
    run(() => instance.toast.update('a', { title: 'Saved' }))
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('announces again when the text changes', () => {
    const announce = announcements('ios')
    const instance = showing({ title: 'Saved', description: 'Stored' })
    run(() => instance.toast.update('a', { description: 'Synced' }))
    expect(announce).toHaveBeenCalledTimes(2)
    expect(announce).toHaveBeenLastCalledWith('Saved. Synced')
  })

  it('announces a custom renderToast too', () => {
    const announce = announcements('ios')
    showing({ title: 'Saved', renderToast: () => <Text>custom</Text> })
    expect(announce).toHaveBeenCalledWith('Saved')
  })

  it('does not announce on Android, where the live region does the work', () => {
    const announce = announcements('android')
    showing({ title: 'Saved', description: 'Stored' })
    expect(announce).not.toHaveBeenCalled()
  })

  it('does not announce a toast that never became visible', () => {
    const announce = announcements('ios')
    const instance = createToast()
    instance.toast.show({ title: 'early' })
    expect(announce).not.toHaveBeenCalled()
  })

  it('exposes only the expected test ids for a title-only toast', () => {
    showing({ title: 'Hi' })
    expect(screen.getByTestId('toast-overlay')).toBeTruthy()
    expect(screen.getByTestId('toast')).toBeTruthy()
    expect(screen.queryByTestId('toast-description')).toBeNull()
    expect(screen.queryByTestId('toast-action')).toBeNull()
    expect(screen.queryByTestId('toast-icon', { includeHiddenElements: true })).toBeNull()
  })
})
