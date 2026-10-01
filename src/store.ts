import type {
  QueueStrategy,
  ToastId,
  ToastOptions,
  ToastPatch,
  ToastRecord
} from './types'

export const DEFAULT_EXIT_TIMEOUT = 1000

const MAX_TIMER_DELAY = 2147483647

type EntryOptions<TPayload> = ToastOptions<TPayload> & { readonly id: ToastId }

export interface ToastEntry<TPayload> extends ToastRecord<TPayload> {
  readonly key: number
  readonly shown: boolean
  readonly options: EntryOptions<TPayload>
}

export interface StoreHost<TPayload> {
  readonly duration: (entry: ToastEntry<TPayload>) => number
  readonly onShow: (toast: ToastRecord<TPayload>) => void
  readonly onHide: (toast: ToastRecord<TPayload>) => void
}

export interface ToastSnapshot<TPayload> {
  readonly toasts: readonly ToastEntry<TPayload>[]
  readonly host: StoreHost<TPayload> | null
}

export interface ToastStoreConfig<TPayload> {
  readonly queue: QueueStrategy<TPayload>
  readonly exitTimeout: number
}

export const fifoQueue: QueueStrategy = {
  select: ({ occupying, pending }) => ({
    activate: occupying.length === 0 && pending[0] ? [pending[0].id] : []
  })
}

export function withoutUndefined<T extends object>(value: T): Partial<T> {
  const result: Partial<T> = {}
  for (const key in value) {
    if (value[key] !== undefined) result[key] = value[key]
  }
  return result
}

const isLive = <TPayload>(entry: ToastEntry<TPayload>) => entry.phase !== 'exiting'

type Timers = Map<number, ReturnType<typeof setTimeout>>

const runSafely = (callback: () => void) => {
  try {
    callback()
  } catch (error) {
    if (__DEV__) console.error('[rn-toast] A toast callback threw an error.', error)
  }
}

const resolveExitTimeout = (exitTimeout: number): number => {
  if (Number.isFinite(exitTimeout) && exitTimeout > 0) return exitTimeout
  if (__DEV__) {
    console.warn(
      `[rn-toast] exitTimeout must be a finite number greater than 0; using ${DEFAULT_EXIT_TIMEOUT} ms.`
    )
  }
  return DEFAULT_EXIT_TIMEOUT
}

export class ToastStore<TPayload> {
  private readonly queue: QueueStrategy<TPayload>
  private readonly exitTimeout: number
  private readonly listeners = new Set<() => void>()
  private readonly durationTimers: Timers = new Map()
  private readonly exitTimers: Timers = new Map()
  private hosts: readonly StoreHost<TPayload>[] = []
  private snapshot: ToastSnapshot<TPayload> = { toasts: [], host: null }
  private nextKey = 1
  private nextId = 1

  constructor(config: ToastStoreConfig<TPayload>) {
    this.queue = config.queue
    this.exitTimeout = resolveExitTimeout(config.exitTimeout)
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): ToastSnapshot<TPayload> => this.snapshot

  attach(host: StoreHost<TPayload>): () => void {
    this.hosts = [...this.hosts, host]
    this.commit(this.snapshot.toasts)
    return () => this.detach(host)
  }

  show(options: ToastOptions<TPayload>): ToastId {
    const id = options.id ?? `toast-${this.nextId++}`
    const live = this.findLive(id)
    if (live) {
      this.replaceEntry(live, { ...options, id })
    } else {
      this.commit([...this.snapshot.toasts, this.createEntry({ ...options, id })])
    }
    return id
  }

  replace(id: ToastId, options: Omit<ToastOptions<TPayload>, 'id'>): void {
    const live = this.findLive(id)
    if (live) this.replaceEntry(live, { ...options, id })
  }

  update(id: ToastId, patch: ToastPatch<TPayload>): void {
    const live = this.findLive(id)
    if (live) this.replaceEntry(live, { ...live.options, ...withoutUndefined(patch) })
  }

  dismiss(id: ToastId): void {
    const live = this.findLive(id)
    if (live) this.close(live.key)
  }

  clear(): void {
    if (!this.snapshot.toasts.some(isLive)) return
    const afterCommit: (() => void)[] = []
    const host = this.activeHost()
    const next = this.snapshot.toasts.flatMap((entry) => {
      if (!isLive(entry)) return [entry]
      const exiting = this.beginExit(entry, host, afterCommit)
      return exiting ? [exiting] : []
    })
    this.commit(next, afterCommit)
  }

  close(key: number): void {
    const entry = this.findByKey(key)
    if (!entry || !isLive(entry)) return
    const afterCommit: (() => void)[] = []
    const exiting = this.beginExit(entry, this.activeHost(), afterCommit)
    this.commit(this.swap(entry, exiting), afterCommit)
  }

  markVisible(key: number): void {
    const entry = this.findByKey(key)
    const host = this.activeHost()
    if (!entry || !host || entry.phase !== 'entering') return
    const visible: ToastEntry<TPayload> = { ...entry, phase: 'visible', shown: true }
    this.startDurationTimer(visible, host)
    this.commit(this.swap(entry, visible), entry.shown ? [] : [() => this.notifyShown(visible, host)])
  }

  exited(key: number): void {
    const entry = this.findByKey(key)
    if (!entry || isLive(entry)) return
    this.commit(this.swap(entry, undefined))
  }

  private detach(host: StoreHost<TPayload>): void {
    const index = this.hosts.lastIndexOf(host)
    if (index === -1) return
    this.hosts = this.hosts.filter((_, position) => position !== index)
    if (this.activeHost()) {
      this.commit(this.snapshot.toasts)
      return
    }
    this.commit(
      this.snapshot.toasts.flatMap((entry): ToastEntry<TPayload>[] => {
        if (!isLive(entry)) return []
        return [entry.phase === 'visible' ? { ...entry, phase: 'entering' } : entry]
      })
    )
  }

  private activeHost(): StoreHost<TPayload> | null {
    return this.hosts[this.hosts.length - 1] ?? null
  }

  private findLive(id: ToastId): ToastEntry<TPayload> | undefined {
    return this.snapshot.toasts.find((entry) => entry.id === id && isLive(entry))
  }

  private findByKey(key: number): ToastEntry<TPayload> | undefined {
    return this.snapshot.toasts.find((entry) => entry.key === key)
  }

  private swap(
    entry: ToastEntry<TPayload>,
    replacement: ToastEntry<TPayload> | undefined
  ): ToastEntry<TPayload>[] {
    return this.snapshot.toasts.flatMap((candidate) => {
      if (candidate !== entry) return [candidate]
      return replacement ? [replacement] : []
    })
  }

  private createEntry(options: EntryOptions<TPayload>): ToastEntry<TPayload> {
    return this.buildEntry(options, { key: this.nextKey++, phase: 'queued', shown: false })
  }

  private buildEntry(
    options: EntryOptions<TPayload>,
    meta: Pick<ToastEntry<TPayload>, 'key' | 'phase' | 'shown'>
  ): ToastEntry<TPayload> {
    return {
      ...meta,
      options,
      id: options.id,
      title: options.title,
      description: options.description,
      variant: options.variant ?? 'info',
      action: options.action,
      payload: options.payload
    }
  }

  private replaceEntry(entry: ToastEntry<TPayload>, options: EntryOptions<TPayload>): void {
    const next = this.buildEntry(options, entry)
    const host = this.activeHost()
    if (host && next.phase === 'visible') this.startDurationTimer(next, host)
    this.commit(this.swap(entry, next))
  }

  private beginExit(
    entry: ToastEntry<TPayload>,
    host: StoreHost<TPayload> | null,
    afterCommit: (() => void)[]
  ): ToastEntry<TPayload> | undefined {
    if (entry.phase === 'queued' || !host) return undefined
    const exiting: ToastEntry<TPayload> = { ...entry, phase: 'exiting' }
    this.startExitTimer(exiting)
    if (entry.shown) afterCommit.push(() => this.notifyHidden(exiting, host))
    return exiting
  }

  private startDurationTimer(entry: ToastEntry<TPayload>, host: StoreHost<TPayload>): void {
    this.cancelTimer(this.durationTimers, entry.key)
    const duration = host.duration(entry)
    if (duration > MAX_TIMER_DELAY) return
    this.durationTimers.set(entry.key, setTimeout(() => this.close(entry.key), duration))
  }

  private startExitTimer(entry: ToastEntry<TPayload>): void {
    this.cancelTimer(this.exitTimers, entry.key)
    this.exitTimers.set(entry.key, setTimeout(() => this.releaseStalledExit(entry), this.exitTimeout))
  }

  private releaseStalledExit(entry: ToastEntry<TPayload>): void {
    const current = this.findByKey(entry.key)
    if (!current || isLive(current)) return
    if (__DEV__) {
      console.warn(
        `[rn-toast] Toast "${entry.id}" transition did not call onExited within ${this.exitTimeout} ms; its slot was released.`
      )
    }
    this.commit(this.swap(current, undefined))
  }

  private cancelTimer(timers: Timers, key: number): void {
    const timer = timers.get(key)
    if (timer === undefined) return
    clearTimeout(timer)
    timers.delete(key)
  }

  private releaseTimers(
    previous: readonly ToastEntry<TPayload>[],
    next: readonly ToastEntry<TPayload>[]
  ): void {
    const phaseByKey = new Map(next.map((entry) => [entry.key, entry.phase]))
    for (const { key } of previous) {
      const phase = phaseByKey.get(key)
      if (phase !== 'visible') this.cancelTimer(this.durationTimers, key)
      if (phase !== 'exiting') this.cancelTimer(this.exitTimers, key)
    }
  }

  private notifyShown(entry: ToastEntry<TPayload>, host: StoreHost<TPayload>): void {
    runSafely(() => entry.options.onShow?.(entry))
    runSafely(() => host.onShow(entry))
  }

  private notifyHidden(entry: ToastEntry<TPayload>, host: StoreHost<TPayload>): void {
    runSafely(() => entry.options.onHide?.(entry))
    runSafely(() => host.onHide(entry))
  }

  private arrange(entries: readonly ToastEntry<TPayload>[]): readonly ToastEntry<TPayload>[] {
    const occupying = entries.filter((entry) => entry.phase !== 'queued')
    let pending = entries.filter((entry) => entry.phase === 'queued')
    const decision = this.queue.select({ occupying, pending })

    const dropped = new Set(decision.drop)
    pending = pending.filter((entry) => !dropped.has(entry.id))

    const activated: ToastEntry<TPayload>[] = []
    for (const id of decision.activate) {
      const entry = pending.find((candidate) => candidate.id === id)
      if (!entry) continue
      activated.push({ ...entry, phase: 'entering' })
      pending = pending.filter((candidate) => candidate !== entry)
    }

    return [...occupying, ...activated, ...pending]
  }

  private commit(
    next: readonly ToastEntry<TPayload>[],
    afterCommit: readonly (() => void)[] = []
  ): void {
    const toasts = this.arrange(next)
    this.releaseTimers(this.snapshot.toasts, toasts)
    this.snapshot = { toasts, host: this.activeHost() }
    this.listeners.forEach((listener) => listener())
    afterCommit.forEach(runSafely)
  }
}
