import type { ComponentType } from 'react'
import type { StyleProp, TextStyle, ViewStyle } from 'react-native'

import type {
  ToastDefaults,
  ToastIcon,
  ToastInsets,
  ToastOptions,
  ToastProviderProps,
  ToastSlot,
  ToastStyles,
  ToastTransitionProps,
  ToastVariant
} from './types'

export interface LibraryDefaults {
  readonly duration: number
  readonly dismissible: boolean
  readonly offset: number
  readonly insets: ToastInsets
  readonly transition: ComponentType<ToastTransitionProps>
  readonly styles: ToastStyles
  readonly variantStyles: Partial<Record<ToastVariant, ToastStyles>>
}

export type ProviderConfig<TPayload> = Omit<ToastProviderProps<TPayload>, 'children'>

export interface ResolvedToast<TPayload> {
  readonly renderToast: ToastSlot<TPayload> | undefined
  readonly icon: ToastIcon<TPayload>
  readonly renderTitle: ToastSlot<TPayload> | undefined
  readonly renderDescription: ToastSlot<TPayload> | undefined
  readonly renderAction: ToastSlot<TPayload> | undefined
  readonly containerStyle: StyleProp<ViewStyle>
  readonly titleStyle: StyleProp<TextStyle>
  readonly descriptionStyle: StyleProp<TextStyle>
  readonly actionStyle: StyleProp<ViewStyle>
  readonly actionLabelStyle: StyleProp<TextStyle>
  readonly dismissible: boolean
  readonly insets: ToastInsets
  readonly offset: number
  readonly transition: ComponentType<ToastTransitionProps>
}

type Layer<TPayload> = ToastDefaults<TPayload> | undefined

const layersOf = <TPayload>(
  options: ToastOptions<TPayload>,
  variant: ToastVariant,
  provider: ProviderConfig<TPayload>
): readonly Layer<TPayload>[] => [options, provider.variants?.[variant], provider]

const firstDefined = <T>(values: readonly (T | undefined)[]): T | undefined =>
  values.find((value) => value !== undefined)

const pick = <TPayload, TKey extends keyof ToastDefaults<TPayload>>(
  layers: readonly Layer<TPayload>[],
  key: TKey
): ToastDefaults<TPayload>[TKey] | undefined => firstDefined(layers.map((layer) => layer?.[key]))

const composeStyle = <TStyle>(...styles: StyleProp<TStyle>[]): StyleProp<TStyle> => styles

export function resolveDuration<TPayload>(
  options: ToastOptions<TPayload>,
  variant: ToastVariant,
  provider: ProviderConfig<TPayload>,
  fallback: number
): number {
  for (const layer of layersOf(options, variant, provider)) {
    const duration = layer?.duration
    if (duration === undefined) continue
    if (duration > 0) return duration
    if (__DEV__) {
      console.warn(
        `[rn-toast] Ignoring invalid duration ${String(duration)}: it must be greater than 0 (use Infinity for a sticky toast).`
      )
    }
  }
  return fallback
}

export function resolveToast<TPayload>(
  options: ToastOptions<TPayload>,
  variant: ToastVariant,
  provider: ProviderConfig<TPayload>,
  library: LibraryDefaults
): ResolvedToast<TPayload> {
  const layers = layersOf(options, variant, provider)
  const variantStyles = library.variantStyles[variant]
  const providerVariant = provider.variants?.[variant]
  const side = (name: keyof ToastInsets): number =>
    firstDefined(layers.map((layer) => layer?.insets?.[name])) ?? library.insets[name]

  return {
    renderToast: pick(layers, 'renderToast'),
    icon: pick(layers, 'icon'),
    renderTitle: pick(layers, 'renderTitle'),
    renderDescription: pick(layers, 'renderDescription'),
    renderAction: pick(layers, 'renderAction'),
    containerStyle: composeStyle(
      library.styles.containerStyle,
      variantStyles?.containerStyle,
      provider.containerStyle,
      providerVariant?.containerStyle,
      options.containerStyle
    ),
    titleStyle: composeStyle(
      library.styles.titleStyle,
      variantStyles?.titleStyle,
      provider.titleStyle,
      providerVariant?.titleStyle,
      options.titleStyle
    ),
    descriptionStyle: composeStyle(
      library.styles.descriptionStyle,
      variantStyles?.descriptionStyle,
      provider.descriptionStyle,
      providerVariant?.descriptionStyle,
      options.descriptionStyle
    ),
    actionStyle: composeStyle(
      library.styles.actionStyle,
      variantStyles?.actionStyle,
      provider.actionStyle,
      providerVariant?.actionStyle,
      options.actionStyle
    ),
    actionLabelStyle: composeStyle(
      library.styles.actionLabelStyle,
      variantStyles?.actionLabelStyle,
      provider.actionLabelStyle,
      providerVariant?.actionLabelStyle,
      options.actionLabelStyle
    ),
    dismissible: pick(layers, 'dismissible') ?? library.dismissible,
    insets: {
      top: side('top'),
      right: side('right'),
      bottom: side('bottom'),
      left: side('left')
    },
    offset: pick(layers, 'offset') ?? library.offset,
    transition: pick(layers, 'transition') ?? library.transition
  }
}
