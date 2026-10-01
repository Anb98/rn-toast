import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'

import { resolveToast } from '../resolve'
import type { ProviderConfig, ResolvedToast } from '../resolve'
import { PassthroughTransition, Toast, libraryDefaults } from '../Toast'
import type { ToastOptions, ToastSlotContext, ToastVariant } from '../types'

type Payload = { userId: string }

const buildContext = (
  overrides: Partial<ToastSlotContext<Payload>['toast']> = {},
  handlers: Partial<Pick<ToastSlotContext<Payload>, 'dismiss' | 'pressAction'>> = {}
): ToastSlotContext<Payload> => ({
  toast: {
    id: 'a',
    phase: 'visible',
    title: 'Saved',
    description: undefined,
    variant: 'info',
    action: undefined,
    payload: undefined,
    ...overrides
  },
  dismiss: handlers.dismiss ?? jest.fn(),
  pressAction: handlers.pressAction ?? jest.fn(() => Promise.resolve())
})

const noProvider: ProviderConfig<Payload> = {}

const resolve = (
  options: Partial<ToastOptions<Payload>> = {},
  provider: ProviderConfig<Payload> = noProvider,
  variant: ToastVariant = 'info'
): ResolvedToast<Payload> =>
  resolveToast<Payload>({ title: 'Saved', ...options }, variant, provider, libraryDefaults)

const hidden = { includeHiddenElements: true }

type TestInstance = ReturnType<typeof screen.getByTestId>

const isInside = (element: TestInstance, testID: string): boolean => {
  for (let node = element.parent; node; node = node.parent) {
    if (node.props.testID === testID) return true
  }
  return false
}

const renderToast = (
  context: ToastSlotContext<Payload>,
  resolved: ResolvedToast<Payload> = resolve()
) => render(<Toast context={context} resolved={resolved} />)

describe('libraryDefaults', () => {
  it('ships the documented behavior defaults', () => {
    expect(libraryDefaults.duration).toBe(3000)
    expect(libraryDefaults.dismissible).toBe(true)
    expect(libraryDefaults.offset).toBe(20)
    expect(libraryDefaults.insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(libraryDefaults.transition).toBe(PassthroughTransition)
  })

  it('gives every built-in variant a different container color', () => {
    const variants: ToastVariant[] = ['info', 'success', 'warning', 'error']
    const colors = variants.map(
      (variant) =>
        StyleSheet.flatten(resolve({}, noProvider, variant).containerStyle)?.backgroundColor
    )
    expect(colors).toEqual(['#08161FED', '#166534', '#92400E', '#991B1B'])
    expect(new Set(colors).size).toBe(4)
  })

  it('falls back to the base look for a variant without library styles', () => {
    const fallback = StyleSheet.flatten(resolve({}, noProvider, 'brand').containerStyle)
    expect(fallback?.backgroundColor).toBe('#08161FED')
  })
})

describe('Toast', () => {
  it('is named Toast', () => {
    expect(Toast.name).toBe('Toast')
  })

  it('renders only the title when nothing else is provided', () => {
    renderToast(buildContext())
    expect(screen.getByTestId('toast-title').props.children).toBe('Saved')
    expect(screen.queryByTestId('toast-description')).toBeNull()
    expect(screen.queryByTestId('toast-action')).toBeNull()
    expect(screen.queryByTestId('toast-icon', hidden)).toBeNull()
    expect(screen.UNSAFE_getAllByType(Text)).toHaveLength(1)
  })

  it('renders the description as text next to the title', () => {
    renderToast(buildContext({ description: 'All changes stored' }))
    expect(screen.getByTestId('toast-title').props.children).toBe('Saved')
    expect(screen.getByTestId('toast-description').props.children).toBe('All changes stored')
  })

  it('does not render an empty description', () => {
    renderToast(buildContext({ description: '' }))
    expect(screen.queryByTestId('toast-description')).toBeNull()
  })

  it('applies title, description and container styles from the resolved config', () => {
    const resolved = resolve({
      description: 'd',
      containerStyle: { margin: 7 },
      titleStyle: { fontSize: 31 },
      descriptionStyle: { fontSize: 13 }
    })
    renderToast(buildContext({ description: 'd' }), resolved)
    expect(StyleSheet.flatten(screen.getByTestId('toast-container').props.style)).toMatchObject({
      margin: 7,
      padding: 12
    })
    expect(StyleSheet.flatten(screen.getByTestId('toast-title').props.style)).toMatchObject({
      fontSize: 31,
      color: 'white'
    })
    expect(StyleSheet.flatten(screen.getByTestId('toast-description').props.style)).toMatchObject({
      fontSize: 13
    })
  })

  it('lays the card out as a bounded row with shadow and elevation', () => {
    renderToast(buildContext())
    expect(StyleSheet.flatten(screen.getByTestId('toast-container').props.style)).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 10,
      elevation: 6,
      shadowOpacity: 0.25
    })
    expect(StyleSheet.flatten(screen.getByTestId('toast-content').props.style)).toMatchObject({
      flex: 1
    })
  })

  describe('icon', () => {
    it('renders an element icon inside a wrapper hidden from assistive tech', () => {
      renderToast(buildContext(), resolve({ icon: <Text testID='custom-icon'>i</Text> }))
      const wrapper = screen.getByTestId('toast-icon', hidden)
      expect(screen.getByTestId('custom-icon', hidden).props.children).toBe('i')
      expect(wrapper.props.accessibilityElementsHidden).toBe(true)
      expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants')
    })

    it('calls a function icon with the slot context', () => {
      const context = buildContext({ payload: { userId: 'u1' } })
      const icon = jest.fn(({ toast }: ToastSlotContext<Payload>) => (
        <Text testID='fn-icon'>{toast.payload?.userId}</Text>
      ))
      renderToast(context, resolve({ icon }))
      expect(icon).toHaveBeenCalledWith(context)
      expect(screen.getByTestId('fn-icon', hidden).props.children).toBe('u1')
    })

    it('renders no icon wrapper by default', () => {
      renderToast(buildContext())
      expect(screen.queryByTestId('toast-icon', hidden)).toBeNull()
    })

    it('renders no icon wrapper when a function icon returns null', () => {
      renderToast(buildContext(), resolve({ icon: () => null }))
      expect(screen.queryByTestId('toast-icon', hidden)).toBeNull()
    })
  })

  describe('action', () => {
    const action = { label: 'Undo', onPress: jest.fn() }

    it('renders a labelled button that sits beside the content', () => {
      renderToast(buildContext({ action }))
      const button = screen.getByTestId('toast-action')
      expect(button.props.accessibilityRole).toBe('button')
      expect(button.props.accessibilityLabel).toBe('Undo')
      expect(button.props.hitSlop).toBe(8)
      expect(screen.getByText('Undo')).toBeTruthy()
      expect(isInside(button, 'toast-content')).toBe(false)
      expect(isInside(button, 'toast-container')).toBe(true)
    })

    it('renders the action without a description', () => {
      renderToast(buildContext({ action }))
      expect(screen.queryByTestId('toast-description')).toBeNull()
      expect(screen.getByTestId('toast-action')).toBeTruthy()
    })

    it('runs the action through the slot context pressAction', () => {
      const pressAction = jest.fn(() => Promise.resolve())
      const dismiss = jest.fn()
      renderToast(buildContext({ action }, { pressAction, dismiss }))
      fireEvent.press(screen.getByTestId('toast-action'))
      expect(pressAction).toHaveBeenCalledTimes(1)
      expect(dismiss).not.toHaveBeenCalled()
    })

    it('applies action and action label styles', () => {
      renderToast(
        buildContext({ action }),
        resolve({ actionStyle: { padding: 9 }, actionLabelStyle: { fontSize: 22 } })
      )
      expect(StyleSheet.flatten(screen.getByTestId('toast-action').props.style)).toMatchObject({
        padding: 9
      })
      expect(StyleSheet.flatten(screen.getByText('Undo').props.style)).toMatchObject({
        fontSize: 22
      })
    })
  })

  describe('slots', () => {
    it('renderTitle replaces only the title', () => {
      renderToast(
        buildContext({ description: 'd' }),
        resolve({ renderTitle: ({ toast }) => <Text testID='my-title'>{`T:${toast.title}`}</Text> })
      )
      expect(screen.getByTestId('my-title').props.children).toBe('T:Saved')
      expect(screen.queryByTestId('toast-title')).toBeNull()
      expect(screen.getByTestId('toast-description').props.children).toBe('d')
    })

    it('renderDescription replaces only the description', () => {
      renderToast(
        buildContext({ description: 'd' }),
        resolve({ renderDescription: () => <Text testID='my-description'>custom</Text> })
      )
      expect(screen.getByTestId('my-description').props.children).toBe('custom')
      expect(screen.queryByTestId('toast-description')).toBeNull()
      expect(screen.getByTestId('toast-title').props.children).toBe('Saved')
    })

    it('renderAction replaces only the action', () => {
      const action = { label: 'Undo', onPress: jest.fn() }
      renderToast(
        buildContext({ action }),
        resolve({ renderAction: () => <Text testID='my-action'>custom</Text> })
      )
      expect(screen.getByTestId('my-action').props.children).toBe('custom')
      expect(screen.queryByTestId('toast-action')).toBeNull()
      expect(screen.getByTestId('toast-title').props.children).toBe('Saved')
    })

    it('renders nothing for a part whose slot returns null', () => {
      renderToast(buildContext(), resolve({ renderTitle: () => null }))
      expect(screen.queryByTestId('toast-title')).toBeNull()
      expect(screen.getByTestId('toast-content')).toBeTruthy()
    })

    it('does not invoke slots for absent parts', () => {
      const renderDescription = jest.fn(() => null)
      const renderAction = jest.fn(() => null)
      renderToast(buildContext(), resolve({ renderDescription, renderAction }))
      expect(renderDescription).not.toHaveBeenCalled()
      expect(renderAction).not.toHaveBeenCalled()
    })

    it('invokes part slots when their part exists', () => {
      const renderDescription = jest.fn(() => null)
      const context = buildContext({ description: 'd' })
      renderToast(context, resolve({ renderDescription }))
      expect(renderDescription).toHaveBeenCalledWith(context)
    })
  })

  describe('dismiss surface', () => {
    it('makes the card and the text column pressable when dismissible', () => {
      const dismiss = jest.fn()
      renderToast(buildContext({}, { dismiss }))
      const container = screen.getByTestId('toast-container')
      const content = screen.getByTestId('toast-content')
      expect(container.props.accessible).toBe(false)
      expect(content.props.accessibilityRole).toBe('button')
      fireEvent.press(container)
      expect(dismiss).toHaveBeenCalledTimes(1)
      fireEvent.press(content)
      expect(dismiss).toHaveBeenCalledTimes(2)
    })

    it('groups title and description and ignores presses when not dismissible', () => {
      const dismiss = jest.fn()
      renderToast(buildContext({}, { dismiss }), resolve({ dismissible: false }))
      const container = screen.getByTestId('toast-container')
      const content = screen.getByTestId('toast-content')
      expect(content.props.accessible).toBe(true)
      expect(content.props.accessibilityRole).toBeUndefined()
      fireEvent.press(container)
      fireEvent.press(content)
      expect(dismiss).not.toHaveBeenCalled()
    })
  })
})

describe('PassthroughTransition', () => {
  it('renders its children', () => {
    render(
      <PassthroughTransition phase='visible' onExited={jest.fn()} dismiss={jest.fn()}>
        <Text testID='child'>inside</Text>
      </PassthroughTransition>
    )
    expect(screen.getByTestId('child').props.children).toBe('inside')
  })

  it('calls onExited once the phase is exiting', () => {
    const onExited = jest.fn()
    const view = render(
      <PassthroughTransition phase='exiting' onExited={onExited} dismiss={jest.fn()}>
        {null}
      </PassthroughTransition>
    )
    expect(onExited).toHaveBeenCalledTimes(1)
    view.rerender(
      <PassthroughTransition phase='exiting' onExited={onExited} dismiss={jest.fn()}>
        {null}
      </PassthroughTransition>
    )
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it('does not call onExited before exiting and calls it when the phase changes', () => {
    const onExited = jest.fn()
    const view = render(
      <PassthroughTransition phase='entering' onExited={onExited} dismiss={jest.fn()}>
        {null}
      </PassthroughTransition>
    )
    view.rerender(
      <PassthroughTransition phase='visible' onExited={onExited} dismiss={jest.fn()}>
        {null}
      </PassthroughTransition>
    )
    expect(onExited).not.toHaveBeenCalled()
    view.rerender(
      <PassthroughTransition phase='exiting' onExited={onExited} dismiss={jest.fn()}>
        {null}
      </PassthroughTransition>
    )
    expect(onExited).toHaveBeenCalledTimes(1)
  })
})
