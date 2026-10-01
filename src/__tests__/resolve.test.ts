/// <reference types="node" />
import { readFileSync } from 'fs'
import { join } from 'path'
import { StyleSheet } from 'react-native'

import { resolveDuration, resolveToast } from '../resolve'
import type { LibraryDefaults, ProviderConfig } from '../resolve'
import type { ToastOptions, ToastSlot } from '../types'

const setDev = (value: boolean) => {
  Object.defineProperty(globalThis, '__DEV__', { value, configurable: true, writable: true })
}

const LibraryTransition = () => null
const ProviderTransition = () => null
const VariantTransition = () => null
const CallTransition = () => null

const library: LibraryDefaults = {
  duration: 3000,
  dismissible: true,
  offset: 20,
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  transition: LibraryTransition,
  styles: {
    containerStyle: { padding: 12 },
    titleStyle: { color: 'white', fontSize: 14 }
  },
  variantStyles: {
    error: { containerStyle: { backgroundColor: 'darkred' } },
    info: { containerStyle: { backgroundColor: 'navy' } }
  }
}

const base: ToastOptions<never> = { title: 'Hello' }
const noProvider: ProviderConfig<never> = {}

const slot = (label: string): ToastSlot<never> => () => label

describe('resolveDuration', () => {
  let warn: jest.SpyInstance

  beforeEach(() => {
    setDev(true)
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    setDev(true)
    warn.mockRestore()
  })

  const provider: ProviderConfig<never> = {
    duration: 4000,
    variants: { error: { duration: 5000 } }
  }

  it('prefers call, then variant, then provider, then the fallback', () => {
    const call = { ...base, duration: 6000 }

    expect(resolveDuration(call, 'error', provider, 3000)).toBe(6000)
    expect(resolveDuration(base, 'error', provider, 3000)).toBe(5000)
    expect(resolveDuration(base, 'info', provider, 3000)).toBe(4000)
    expect(resolveDuration(base, 'info', noProvider, 3000)).toBe(3000)
    expect(warn).not.toHaveBeenCalled()
  })

  it('lets undefined fall through to the next layer', () => {
    const call = { ...base, duration: undefined }

    expect(resolveDuration(call, 'error', provider, 3000)).toBe(5000)
  })

  it('accepts Infinity and any positive number as valid', () => {
    expect(resolveDuration({ ...base, duration: Infinity }, 'info', provider, 3000)).toBe(Infinity)
    expect(resolveDuration({ ...base, duration: 0.5 }, 'info', provider, 3000)).toBe(0.5)
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([0, -5, Number.NaN, -Infinity])(
    'skips the invalid value %p with one warning and uses the next valid layer',
    (invalid) => {
      const call = { ...base, duration: invalid }

      expect(resolveDuration(call, 'info', provider, 3000)).toBe(4000)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toContain(String(invalid))
    }
  )

  it('warns once per invalid layer and falls back when every layer is invalid', () => {
    const call = { ...base, duration: 0 }
    const invalidProvider: ProviderConfig<never> = {
      duration: Number.NaN,
      variants: { error: { duration: -5 } }
    }

    expect(resolveDuration(call, 'error', invalidProvider, 3000)).toBe(3000)
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('falls back to the provider default when only the call is invalid', () => {
    expect(resolveDuration({ ...base, duration: -1 }, 'info', { duration: 1234 }, 3000)).toBe(1234)
  })

  it('applies the same fallback without warning in production', () => {
    setDev(false)

    expect(resolveDuration({ ...base, duration: Number.NaN }, 'info', provider, 3000)).toBe(4000)
    expect(resolveDuration({ ...base, duration: 0 }, 'info', noProvider, 3000)).toBe(3000)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('resolveToast scalars and slots', () => {
  it('resolves library defaults when nothing else is set', () => {
    const resolved = resolveToast(base, 'info', noProvider, library)

    expect(resolved.dismissible).toBe(true)
    expect(resolved.offset).toBe(20)
    expect(resolved.insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    expect(resolved.transition).toBe(LibraryTransition)
    expect(resolved.renderToast).toBeUndefined()
    expect(resolved.icon).toBeUndefined()
  })

  it('does not let undefined override a lower level', () => {
    const resolved = resolveToast(
      { ...base, dismissible: undefined, offset: undefined },
      'info',
      { dismissible: false, offset: 8 },
      library
    )

    expect(resolved.dismissible).toBe(false)
    expect(resolved.offset).toBe(8)
  })

  it('lets false and zero override a lower level', () => {
    const resolved = resolveToast(
      { ...base, dismissible: false, offset: 0 },
      'info',
      { dismissible: true, offset: 8 },
      library
    )

    expect(resolved.dismissible).toBe(false)
    expect(resolved.offset).toBe(0)
  })

  it('applies slot precedence call > variant > provider', () => {
    const provider: ProviderConfig<never> = {
      renderTitle: slot('A'),
      variants: { info: { renderTitle: slot('B') } }
    }
    const context = {
      toast: {
        id: 'x',
        phase: 'visible' as const,
        title: 't',
        description: undefined,
        variant: 'info' as const,
        action: undefined,
        payload: undefined
      },
      dismiss: () => undefined,
      pressAction: () => Promise.resolve()
    }

    const variantWins = resolveToast(base, 'info', provider, library)
    const callWins = resolveToast({ ...base, renderTitle: slot('C') }, 'info', provider, library)
    const providerOnly = resolveToast(base, 'error', provider, library)

    expect(variantWins.renderTitle?.(context)).toBe('B')
    expect(callWins.renderTitle?.(context)).toBe('C')
    expect(providerOnly.renderTitle?.(context)).toBe('A')
  })

  it('resolves renderToast, renderDescription, renderAction and icon the same way', () => {
    const provider: ProviderConfig<never> = {
      renderToast: slot('provider-toast'),
      icon: 'provider-icon',
      variants: { info: { icon: 'variant-icon', renderAction: slot('variant-action') } }
    }

    const resolved = resolveToast(
      { ...base, renderDescription: slot('call-description') },
      'info',
      provider,
      library
    )

    expect(resolved.icon).toBe('variant-icon')
    expect(resolved.renderToast).toBe(provider.renderToast)
    expect(resolved.renderAction).toBe(provider.variants?.info?.renderAction)
    expect(resolved.renderDescription).toBeDefined()
  })

  it('treats a null icon as an explicit override', () => {
    const resolved = resolveToast({ ...base, icon: null }, 'info', { icon: 'provider-icon' }, library)

    expect(resolved.icon).toBeNull()
  })

  it('applies transition precedence call > variant > provider > library', () => {
    const provider: ProviderConfig<never> = {
      transition: ProviderTransition,
      variants: { info: { transition: VariantTransition } }
    }

    expect(resolveToast(base, 'error', provider, library).transition).toBe(ProviderTransition)
    expect(resolveToast(base, 'info', provider, library).transition).toBe(VariantTransition)
    expect(
      resolveToast({ ...base, transition: CallTransition }, 'info', provider, library).transition
    ).toBe(CallTransition)
  })

  it('never merges lifecycle callbacks into the resolved toast', () => {
    const resolved = resolveToast(
      { ...base, onShow: jest.fn(), onHide: jest.fn(), onError: jest.fn() },
      'info',
      { onShow: jest.fn() },
      library
    )

    expect(resolved).not.toHaveProperty('onShow')
    expect(resolved).not.toHaveProperty('onHide')
    expect(resolved).not.toHaveProperty('onError')
  })
})

describe('resolveToast insets', () => {
  it('merges partial insets over zeros per side', () => {
    const resolved = resolveToast(base, 'info', { insets: { top: 44, left: 10 } }, library)

    expect(resolved.insets).toEqual({ top: 44, right: 0, bottom: 0, left: 10 })
  })

  it('resolves each side independently across levels', () => {
    const provider: ProviderConfig<never> = {
      insets: { top: 44, left: 10, right: 10 },
      variants: { info: { insets: { left: 30 } } }
    }

    const resolved = resolveToast({ ...base, insets: { top: 50 } }, 'info', provider, library)

    expect(resolved.insets).toEqual({ top: 50, right: 10, bottom: 0, left: 30 })
  })

  it('keeps a per-call zero inset instead of falling through', () => {
    const resolved = resolveToast({ ...base, insets: { top: 0 } }, 'info', { insets: { top: 44 } }, library)

    expect(resolved.insets.top).toBe(0)
  })

  it('combines a per-call offset of zero with a per-call top inset', () => {
    const resolved = resolveToast(
      { ...base, offset: 0, insets: { top: 50 } },
      'info',
      { offset: 20 },
      library
    )

    expect(resolved.offset).toBe(0)
    expect(resolved.insets.top).toBe(50)
  })
})

describe('resolveToast styles', () => {
  it('composes library, variant, provider and call styles with later levels winning', () => {
    const provider: ProviderConfig<never> = {
      titleStyle: { color: 'red', fontSize: 10 },
      variants: { info: { titleStyle: { fontWeight: 'bold' } } }
    }

    const resolved = resolveToast({ ...base, titleStyle: { color: 'blue' } }, 'info', provider, library)

    expect(StyleSheet.flatten(resolved.titleStyle)).toEqual({
      color: 'blue',
      fontSize: 10,
      fontWeight: 'bold'
    })
  })

  it('keeps lower-level keys the higher levels do not set', () => {
    const resolved = resolveToast(base, 'info', { titleStyle: { color: 'red' } }, library)

    expect(StyleSheet.flatten(resolved.titleStyle)).toEqual({ color: 'red', fontSize: 14 })
  })

  it('flattens array styles at any level', () => {
    const resolved = resolveToast(
      { ...base, containerStyle: [{ margin: 1 }, { margin: 2, opacity: 0.5 }] },
      'info',
      { containerStyle: [{ borderRadius: 4 }] },
      library
    )

    expect(StyleSheet.flatten(resolved.containerStyle)).toEqual({
      padding: 12,
      backgroundColor: 'navy',
      borderRadius: 4,
      margin: 2,
      opacity: 0.5
    })
  })

  it('applies the variant style layer of the toast variant only', () => {
    const error = StyleSheet.flatten(resolveToast(base, 'error', noProvider, library).containerStyle)
    const info = StyleSheet.flatten(resolveToast(base, 'info', noProvider, library).containerStyle)

    expect(error.backgroundColor).toBe('darkred')
    expect(info.backgroundColor).toBe('navy')
  })

  it('falls back to the base styles for a variant without a style layer', () => {
    const resolved = resolveToast(base, 'warning', noProvider, library)

    expect(StyleSheet.flatten(resolved.containerStyle)).toEqual({ padding: 12 })
  })

  it('resolves description, action and action label styles', () => {
    const resolved = resolveToast(
      { ...base, descriptionStyle: { color: 'gray' }, actionStyle: { padding: 2 }, actionLabelStyle: { color: 'gold' } },
      'info',
      noProvider,
      library
    )

    expect(StyleSheet.flatten(resolved.descriptionStyle)).toEqual({ color: 'gray' })
    expect(StyleSheet.flatten(resolved.actionStyle)).toEqual({ padding: 2 })
    expect(StyleSheet.flatten(resolved.actionLabelStyle)).toEqual({ color: 'gold' })
  })
})

describe('resolver purity', () => {
  it('does not import react-native at runtime', () => {
    const source = readFileSync(join(__dirname, '..', 'resolve.ts'), 'utf8')

    expect(source).toMatch(/import type/)
    expect(source).not.toMatch(/^import (?!type)[^\n]*from 'react/m)
  })
})
