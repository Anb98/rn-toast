/// <reference types="node" />
import { readFileSync } from 'fs'
import { join } from 'path'

import { DEFAULT_EXIT_TIMEOUT, fifoQueue, ToastStore } from '../store'
import type { StoreHost, ToastEntry } from '../store'
import type { QueueStrategy, QueueState, ToastRecord } from '../types'

const createStore = (queue: QueueStrategy = fifoQueue) =>
  new ToastStore<unknown>({ queue, exitTimeout: DEFAULT_EXIT_TIMEOUT })

const phases = (store: ToastStore<unknown>) =>
  store.getSnapshot().toasts.map((entry) => `${entry.id}:${entry.phase}`)

const keyOf = (store: ToastStore<unknown>, id: string): number => {
  const entry = store.getSnapshot().toasts.find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`no entry for ${id}`)
  return entry.key
}

describe('store purity', () => {
  it('does not import react or react-native', () => {
    const source = readFileSync(join(__dirname, '..', 'store.ts'), 'utf8')

    expect(source).toMatch(/import/)
    expect(source).not.toMatch(/from 'react'/)
    expect(source).not.toMatch(/from 'react-native'/)
  })
})

describe('snapshot', () => {
  it('returns the same reference while nothing changes', () => {
    const store = createStore()

    expect(store.getSnapshot()).toBe(store.getSnapshot())

    store.show({ title: 'A' })
    const afterShow = store.getSnapshot()

    expect(store.getSnapshot()).toBe(afterShow)
  })

  it('changes and notifies once per mutation, and stops after unsubscribe', () => {
    const store = createStore()
    const listener = jest.fn()
    const before = store.getSnapshot()
    const unsubscribe = store.subscribe(listener)

    store.show({ title: 'A' })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).not.toBe(before)
    expect(store.getSnapshot().host).toBeNull()
    expect(store.getSnapshot().toasts[0]?.title).toBe('A')

    unsubscribe()
    store.show({ title: 'B' })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not commit or notify on no-op operations', () => {
    const store = createStore()
    store.show({ id: 'a', title: 'A' })
    const listener = jest.fn()
    store.subscribe(listener)
    const snapshot = store.getSnapshot()

    store.update('nope', { title: 'x' })
    store.replace('nope', { title: 'x' })
    store.dismiss('nope')
    store.close(999)
    store.exited(999)
    store.exited(keyOf(store, 'a'))

    expect(listener).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toBe(snapshot)
  })
})

describe('ids', () => {
  it('generates distinct non-empty ids', () => {
    const store = createStore()

    const first = store.show({ title: 'A' })
    const second = store.show({ title: 'B' })

    expect(first).toBe('toast-1')
    expect(second).toBe('toast-2')
  })

  it('numbers generated ids per instance', () => {
    const other = createStore()

    createStore().show({ title: 'A' })

    expect(other.show({ title: 'B' })).toBe('toast-1')
  })

  it('honors an explicit id', () => {
    const store = createStore()

    expect(store.show({ id: 'a', title: 'x' })).toBe('a')
    expect(store.getSnapshot().toasts[0]?.id).toBe('a')
  })

  it('defaults the variant to info', () => {
    const store = createStore()
    store.show({ id: 'a', title: 'x' })
    store.show({ id: 'b', title: 'y', variant: 'error' })

    expect(store.getSnapshot().toasts.map((entry) => entry.variant)).toEqual(['info', 'error'])
  })
})

describe('show, replace and update on a live id', () => {
  it('replaces the options of a queued toast and keeps its key and position', () => {
    const store = createStore()
    store.show({ id: 'a', title: 'A' })
    store.show({ id: 'b', title: 'B', description: 'details' })
    const keyBefore = keyOf(store, 'b')

    store.show({ id: 'b', title: 'new' })

    const toasts = store.getSnapshot().toasts
    expect(toasts).toHaveLength(2)
    expect(toasts[1]).toMatchObject({ id: 'b', title: 'new', description: undefined, phase: 'queued' })
    expect(toasts[1]?.key).toBe(keyBefore)
  })

  it('replaces the options of an entering toast and keeps its phase', () => {
    const store = createStore()
    store.show({ id: 'a', title: 'A', description: 'details' })

    store.show({ id: 'a', title: 'A2' })

    expect(store.getSnapshot().toasts).toHaveLength(1)
    expect(store.getSnapshot().toasts[0]).toMatchObject({
      title: 'A2',
      description: undefined,
      phase: 'entering'
    })
  })

  it('merges only the defined keys on update', () => {
    const store = createStore()
    store.show({ id: 'a', title: 'A', description: 'details', variant: 'success' })
    const before = store.getSnapshot()

    store.update('a', { title: 'z', description: undefined })

    const entry = store.getSnapshot().toasts[0]
    expect(entry).toMatchObject({ title: 'z', description: 'details', variant: 'success' })
    expect(store.getSnapshot()).not.toBe(before)
  })

  it('replaces the options through replace when a live entry exists', () => {
    const store = createStore()
    store.show({ id: 'a', title: 'A', description: 'details' })

    store.replace('a', { title: 'S' })

    expect(store.getSnapshot().toasts[0]).toMatchObject({ title: 'S', description: undefined })
  })

  it('ignores replace without a live entry', () => {
    const store = createStore()

    store.replace('ghost', { title: 'S' })

    expect(store.getSnapshot().toasts).toHaveLength(0)
  })
})

describe('queue phases and FIFO', () => {
  it('promotes the first toast to entering and queues the rest', () => {
    const store = createStore()

    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })
    store.show({ id: 'C', title: 'C' })

    expect(phases(store)).toEqual(['A:entering', 'B:queued', 'C:queued'])
  })

  it('promotes the next toast in the same commit as the removal', () => {
    const store = createStore()
    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })
    const seen: string[][] = []
    store.subscribe(() => seen.push(phases(store)))

    store.dismiss('A')

    expect(seen).toEqual([['B:entering']])
  })

  it('serves toasts in insertion order', () => {
    const store = createStore()
    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })
    store.show({ id: 'C', title: 'C' })
    const order: string[] = []

    for (let step = 0; step < 3; step += 1) {
      const active = store.getSnapshot().toasts[0]
      if (active) order.push(active.id)
      store.dismiss(active?.id ?? '')
    }

    expect(order).toEqual(['A', 'B', 'C'])
    expect(store.getSnapshot().toasts).toHaveLength(0)
  })

  it('keeps every toast when 500 are shown', () => {
    const store = createStore()

    for (let index = 0; index < 500; index += 1) store.show({ title: `t${index}` })

    const toasts = store.getSnapshot().toasts
    expect(toasts).toHaveLength(500)
    expect(toasts.filter((entry) => entry.phase === 'queued')).toHaveLength(499)
    expect(toasts.filter((entry) => entry.phase === 'entering')).toHaveLength(1)
  })
})

describe('dismiss and clear without a host', () => {
  it('removes a queued toast without ever entering', () => {
    const store = createStore()
    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })

    store.dismiss('B')

    expect(phases(store)).toEqual(['A:entering'])
  })

  it('removes an entering toast immediately when no host is attached', () => {
    const store = createStore()
    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })

    store.dismiss('A')

    expect(phases(store)).toEqual(['B:entering'])
  })

  it('closes by entry key', () => {
    const store = createStore()
    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })

    store.close(keyOf(store, 'A'))

    expect(phases(store)).toEqual(['B:entering'])
  })

  it('clears every entry without promoting dropped ones', () => {
    const store = createStore()
    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })
    store.show({ id: 'C', title: 'C' })

    store.clear()

    expect(store.getSnapshot().toasts).toHaveLength(0)
  })

  it('does not notify when clearing an empty store', () => {
    const store = createStore()
    const listener = jest.fn()
    store.subscribe(listener)

    store.clear()

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('custom queue strategies', () => {
  const twoSlots: QueueStrategy = {
    select: ({ occupying, pending }) => ({
      activate: pending.slice(0, Math.max(0, 2 - occupying.length)).map((toast) => toast.id)
    })
  }

  it('honors a two-slot strategy', () => {
    const store = createStore(twoSlots)

    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })
    store.show({ id: 'C', title: 'C' })

    expect(phases(store)).toEqual(['A:entering', 'B:entering', 'C:queued'])
  })

  it('fills a freed slot in the same commit', () => {
    const store = createStore(twoSlots)
    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })
    store.show({ id: 'C', title: 'C' })

    store.dismiss('A')

    expect(phases(store)).toEqual(['B:entering', 'C:entering'])
  })

  it('drops pending toasts that the strategy rejects', () => {
    const capping: QueueStrategy = {
      select: ({ occupying, pending }) => ({
        activate: occupying.length === 0 && pending[0] ? [pending[0].id] : [],
        drop: pending.slice(2).map((toast) => toast.id)
      })
    }
    const store = createStore(capping)

    for (const id of ['A', 'B', 'C', 'D', 'E']) store.show({ id, title: id })

    expect(store.getSnapshot().toasts).toHaveLength(3)
    expect(phases(store)).toEqual(['A:entering', 'B:queued', 'C:queued'])
  })

  it('passes occupying and pending records in activation and insertion order', () => {
    const seen: QueueState<unknown>[] = []
    const spy: QueueStrategy = {
      select: (state) => {
        seen.push(state)
        return fifoQueue.select(state)
      }
    }
    const store = createStore(spy)

    store.show({ id: 'A', title: 'A' })
    store.show({ id: 'B', title: 'B' })

    const last = seen[seen.length - 1]
    expect(last?.occupying.map((toast) => toast.id)).toEqual(['A'])
    expect(last?.pending.map((toast) => toast.id)).toEqual(['B'])
    expect(last?.occupying[0]?.phase).toBe('entering')
  })

  it('ignores activate ids that are not pending', () => {
    const store = createStore({ select: () => ({ activate: ['ghost'] }) })

    store.show({ id: 'A', title: 'A' })

    expect(phases(store)).toEqual(['A:queued'])
  })
})

const MAX_TIMER_DELAY = 2147483647

const setDev = (value: boolean) => {
  Object.defineProperty(globalThis, '__DEV__', { value, configurable: true, writable: true })
}

interface TestHost extends StoreHost<unknown> {
  readonly onShow: jest.Mock<void, [ToastRecord<unknown>]>
  readonly onHide: jest.Mock<void, [ToastRecord<unknown>]>
}

const createHost = (duration: (entry: ToastEntry<unknown>) => number = () => 3000): TestHost => ({
  duration: jest.fn(duration),
  onShow: jest.fn(),
  onHide: jest.fn()
})

const phaseOf = (store: ToastStore<unknown>, id: string) =>
  store.getSnapshot().toasts.find((entry) => entry.id === id)?.phase

const show = (store: ToastStore<unknown>, id: string, extra: { title?: string } = {}) =>
  store.show({ id, title: extra.title ?? id })

const showVisible = (store: ToastStore<unknown>, id: string) => {
  show(store, id)
  store.markVisible(keyOf(store, id))
}

describe('host and timers', () => {
  let warn: jest.SpyInstance
  let error: jest.SpyInstance

  beforeEach(() => {
    jest.useFakeTimers()
    setDev(true)
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    setDev(true)
    warn.mockRestore()
    error.mockRestore()
  })

  describe('host attachment', () => {
    it('exposes the attached host in the snapshot and notifies on attach and detach', () => {
      const store = createStore()
      const host = createHost()
      const listener = jest.fn()
      store.subscribe(listener)

      const detach = store.attach(host)

      expect(store.getSnapshot().host).toBe(host)
      expect(listener).toHaveBeenCalledTimes(1)

      detach()

      expect(store.getSnapshot().host).toBeNull()
      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('uses the last attached host and falls back to the previous one', () => {
      const store = createStore()
      const root = createHost()
      const modal = createHost()
      store.attach(root)

      const detachModal = store.attach(modal)
      expect(store.getSnapshot().host).toBe(modal)

      detachModal()
      expect(store.getSnapshot().host).toBe(root)
    })

    it('ignores a second detach call', () => {
      const store = createStore()
      const first = createHost()
      const second = createHost()
      const detachFirst = store.attach(first)
      store.attach(second)

      detachFirst()
      detachFirst()

      expect(store.getSnapshot().host).toBe(second)
    })

    it('keeps a toast entering and timerless while no host is attached', () => {
      const store = createStore()
      show(store, 'A')

      store.markVisible(keyOf(store, 'A'))
      jest.advanceTimersByTime(60000)

      expect(phases(store)).toEqual(['A:entering'])
    })

    it('reverts visible toasts to entering and drops their timers when the last host detaches', () => {
      const store = createStore()
      const host = createHost()
      const detach = store.attach(host)
      showVisible(store, 'A')

      detach()
      jest.advanceTimersByTime(60000)

      expect(phases(store)).toEqual(['A:entering'])
    })

    it('does not fire onShow twice when a reverted toast is shown again', () => {
      const store = createStore()
      const host = createHost()
      const detach = store.attach(host)
      showVisible(store, 'A')

      detach()
      store.attach(host)
      store.markVisible(keyOf(store, 'A'))

      expect(phaseOf(store, 'A')).toBe('visible')
      expect(host.onShow).toHaveBeenCalledTimes(1)
    })

    it('removes exiting toasts and promotes the next one when the last host detaches', () => {
      const store = createStore()
      const host = createHost()
      const detach = store.attach(host)
      showVisible(store, 'A')
      show(store, 'B')
      store.dismiss('A')
      expect(phases(store)).toEqual(['A:exiting', 'B:queued'])

      detach()

      expect(phases(store)).toEqual(['B:entering'])
      jest.advanceTimersByTime(DEFAULT_EXIT_TIMEOUT * 2)
      expect(warn).not.toHaveBeenCalled()
    })

    it('survives attach, detach, attach as StrictMode does', () => {
      const store = createStore()
      const host = createHost()
      show(store, 'A')

      store.attach(host)()
      store.attach(host)
      store.markVisible(keyOf(store, 'A'))

      expect(phaseOf(store, 'A')).toBe('visible')
      expect(host.onShow).toHaveBeenCalledTimes(1)
    })
  })

  describe('phases', () => {
    it('moves a toast through entering, visible, exiting and removed', () => {
      const store = createStore()
      store.attach(createHost())
      const observed: string[] = []
      store.subscribe(() => observed.push(phases(store).join(',') || 'removed'))

      show(store, 'A')
      store.markVisible(keyOf(store, 'A'))
      store.dismiss('A')
      store.exited(keyOf(store, 'A'))

      expect(observed).toEqual(['A:entering', 'A:visible', 'A:exiting', 'removed'])
    })

    it('ignores markVisible on a toast that is not entering', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'A')
      show(store, 'B')
      const listener = jest.fn()
      store.subscribe(listener)

      store.markVisible(keyOf(store, 'A'))
      store.markVisible(keyOf(store, 'B'))

      expect(listener).not.toHaveBeenCalled()
      expect(phaseOf(store, 'B')).toBe('queued')
    })

    it('moves a visible toast to exiting on dismiss', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'A')

      store.dismiss('A')

      expect(phaseOf(store, 'A')).toBe('exiting')
    })

    it('holds the slot while a toast is exiting', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'A')
      show(store, 'B')

      store.dismiss('A')
      jest.advanceTimersByTime(100)

      expect(phases(store)).toEqual(['A:exiting', 'B:queued'])
    })

    it('promotes the next toast in the same commit as exited', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'A')
      show(store, 'B')
      store.dismiss('A')
      const seen: string[][] = []
      store.subscribe(() => seen.push(phases(store)))

      store.exited(keyOf(store, 'A'))

      expect(seen).toEqual([['B:entering']])
    })

    it('exposes exiting records to the queue strategy', () => {
      const seen: QueueState<unknown>[] = []
      const spy: QueueStrategy = {
        select: (state) => {
          seen.push(state)
          return fifoQueue.select(state)
        }
      }
      const store = createStore(spy)
      store.attach(createHost())
      showVisible(store, 'A')
      show(store, 'B')

      store.dismiss('A')

      const last = seen[seen.length - 1]
      expect(last?.occupying.map((toast) => `${toast.id}:${toast.phase}`)).toEqual(['A:exiting'])
      expect(last?.pending.map((toast) => toast.id)).toEqual(['B'])
    })

    it('ignores exited for a toast that is not exiting', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'A')

      store.exited(keyOf(store, 'A'))

      expect(phaseOf(store, 'A')).toBe('visible')
    })

    it('treats exited as idempotent and promotes once', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'A')
      show(store, 'B')
      store.dismiss('A')
      const key = keyOf(store, 'A')

      store.exited(key)
      store.exited(key)

      expect(phases(store)).toEqual(['B:entering'])
    })

    it('does not leave a frame without A or B when A exits', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'A')
      show(store, 'B')
      store.dismiss('A')
      const frames: string[][] = []
      store.subscribe(() => frames.push(phases(store)))

      store.exited(keyOf(store, 'A'))

      expect(frames).toHaveLength(1)
      expect(frames[0]).toEqual(['B:entering'])
    })

    it('creates a new queued entry when showing an id that is exiting', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'a')
      const oldKey = keyOf(store, 'a')
      store.dismiss('a')

      show(store, 'a', { title: 'again' })

      const toasts = store.getSnapshot().toasts
      expect(toasts.map((entry) => `${entry.id}:${entry.phase}`)).toEqual(['a:exiting', 'a:queued'])
      expect(toasts[1]?.key).not.toBe(oldKey)
      expect(toasts[1]?.title).toBe('again')
    })

    it('targets the live entry for dismiss and only the exiting entry for exited', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'a')
      const oldKey = keyOf(store, 'a')
      store.dismiss('a')
      show(store, 'a', { title: 'again' })

      store.dismiss('a')
      expect(phases(store)).toEqual(['a:exiting'])

      show(store, 'a', { title: 'third' })
      store.exited(oldKey)
      expect(store.getSnapshot().toasts.map((entry) => entry.title)).toEqual(['third'])
    })

    it('never touches an exiting entry through show, update, replace or dismiss by id', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'a')
      store.dismiss('a')
      const exiting = store.getSnapshot().toasts[0]
      const listener = jest.fn()
      store.subscribe(listener)

      store.update('a', { title: 'x' })
      store.replace('a', { title: 'x' })
      store.dismiss('a')

      expect(listener).not.toHaveBeenCalled()
      expect(store.getSnapshot().toasts[0]).toBe(exiting)
    })

    it('exits an active toast, drops queued ones and never shows them on clear', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'A')
      show(store, 'B')
      show(store, 'C')

      store.clear()
      expect(phases(store)).toEqual(['A:exiting'])

      store.exited(keyOf(store, 'A'))
      expect(store.getSnapshot().toasts).toHaveLength(0)
    })

    it('removes an entering toast immediately when the last host is gone before close', () => {
      const store = createStore()
      const detach = store.attach(createHost())
      show(store, 'A')
      show(store, 'B')
      detach()

      store.dismiss('A')

      expect(phases(store)).toEqual(['B:entering'])
    })

    it('sends an entering toast to exiting when a host is attached', () => {
      const store = createStore()
      const host = createHost()
      store.attach(host)
      show(store, 'A')

      store.dismiss('A')

      expect(phaseOf(store, 'A')).toBe('exiting')
      expect(host.onShow).not.toHaveBeenCalled()
      expect(host.onHide).not.toHaveBeenCalled()
    })
  })

  describe('duration timers', () => {
    it('exits a visible toast once its positive finite duration elapses', () => {
      const store = createStore()
      store.attach(createHost(() => 500))
      showVisible(store, 'A')

      jest.advanceTimersByTime(499)
      expect(phaseOf(store, 'A')).toBe('visible')

      jest.advanceTimersByTime(1)
      expect(phaseOf(store, 'A')).toBe('exiting')
    })

    it('keeps a sticky toast visible until it is dismissed', () => {
      const store = createStore()
      store.attach(createHost(() => Infinity))
      showVisible(store, 'A')

      jest.advanceTimersByTime(10 * 60 * 1000)
      expect(phaseOf(store, 'A')).toBe('visible')

      store.dismiss('A')
      expect(phaseOf(store, 'A')).toBe('exiting')
    })

    it('treats durations above the timer limit as sticky', () => {
      const store = createStore()
      store.attach(createHost(() => MAX_TIMER_DELAY + 1))
      showVisible(store, 'A')

      jest.advanceTimersByTime(MAX_TIMER_DELAY)

      expect(phaseOf(store, 'A')).toBe('visible')
    })

    it('schedules a toast at the timer limit', () => {
      const store = createStore()
      store.attach(createHost(() => MAX_TIMER_DELAY))
      showVisible(store, 'A')

      jest.advanceTimersByTime(MAX_TIMER_DELAY)

      expect(phaseOf(store, 'A')).toBe('exiting')
    })

    it('starts the timer at visible, not while queued or entering', () => {
      const store = createStore()
      store.attach(createHost(() => 3000))
      showVisible(store, 'A')
      show(store, 'B')

      jest.advanceTimersByTime(2999)
      store.dismiss('A')
      store.exited(keyOf(store, 'A'))
      expect(phaseOf(store, 'B')).toBe('entering')

      jest.advanceTimersByTime(10000)
      expect(phaseOf(store, 'B')).toBe('entering')

      store.markVisible(keyOf(store, 'B'))
      jest.advanceTimersByTime(2999)
      expect(phaseOf(store, 'B')).toBe('visible')
      jest.advanceTimersByTime(1)
      expect(phaseOf(store, 'B')).toBe('exiting')
    })

    it('asks the active host for the duration of the entry when the timer starts', () => {
      const store = createStore()
      const host = createHost(() => 3000)
      store.attach(host)
      showVisible(store, 'A')

      expect(host.duration).toHaveBeenCalledTimes(1)
      expect(host.duration).toHaveBeenCalledWith(expect.objectContaining({ id: 'A' }))
    })

    it('cancels the timer when a toast is dismissed early', () => {
      const store = createStore()
      const host = createHost(() => 3000)
      store.attach(host)
      showVisible(store, 'A')
      show(store, 'B')
      store.dismiss('A')
      store.exited(keyOf(store, 'A'))
      store.markVisible(keyOf(store, 'B'))
      store.dismiss('B')
      store.exited(keyOf(store, 'B'))

      jest.advanceTimersByTime(10000)

      expect(host.onHide).toHaveBeenCalledTimes(2)
      expect(store.getSnapshot().toasts).toHaveLength(0)
    })

    it('restarts the timer with the new duration on any update', () => {
      const store = createStore()
      store.attach(createHost(() => 3000))
      showVisible(store, 'A')
      jest.advanceTimersByTime(2000)

      store.update('A', { title: 'x' })

      jest.advanceTimersByTime(2999)
      expect(phaseOf(store, 'A')).toBe('visible')
      jest.advanceTimersByTime(1)
      expect(phaseOf(store, 'A')).toBe('exiting')
    })

    it('restarts the timer when a live id is shown again', () => {
      const store = createStore()
      store.attach(createHost(() => 3000))
      showVisible(store, 'A')
      jest.advanceTimersByTime(2000)

      show(store, 'A', { title: 'again' })

      jest.advanceTimersByTime(2999)
      expect(phaseOf(store, 'A')).toBe('visible')
      jest.advanceTimersByTime(1)
      expect(phaseOf(store, 'A')).toBe('exiting')
    })

    it('restarts the timer when a live id is replaced', () => {
      const store = createStore()
      store.attach(createHost(() => 3000))
      showVisible(store, 'A')
      jest.advanceTimersByTime(2000)

      store.replace('A', { title: 'settled' })

      jest.advanceTimersByTime(2999)
      expect(phaseOf(store, 'A')).toBe('visible')
      jest.advanceTimersByTime(1)
      expect(phaseOf(store, 'A')).toBe('exiting')
    })

    it('uses the duration resolved at restart time', () => {
      let duration = 3000
      const store = createStore()
      store.attach(createHost(() => duration))
      showVisible(store, 'A')

      duration = 500
      store.update('A', { title: 'x' })

      jest.advanceTimersByTime(500)
      expect(phaseOf(store, 'A')).toBe('exiting')
    })

    it('does not start a timer when updating a toast that is still entering', () => {
      const store = createStore()
      const host = createHost()
      store.attach(host)
      show(store, 'A')

      store.update('A', { title: 'x' })
      jest.advanceTimersByTime(10000)

      expect(host.duration).not.toHaveBeenCalled()
      expect(phaseOf(store, 'A')).toBe('entering')
    })

    it('needs no React to expire a toast', () => {
      const store = createStore()
      store.attach({ duration: () => 3000, onShow: () => undefined, onHide: () => undefined })
      showVisible(store, 'A')

      jest.advanceTimersByTime(3000)

      expect(phaseOf(store, 'A')).toBe('exiting')
    })
  })

  describe('exit safety timeout', () => {
    const exitingPair = (store: ToastStore<unknown>) => {
      store.attach(createHost())
      showVisible(store, 'A')
      show(store, 'B')
      store.dismiss('A')
    }

    it('frees the slot at the default timeout and warns with the toast id', () => {
      const store = createStore()
      exitingPair(store)

      jest.advanceTimersByTime(DEFAULT_EXIT_TIMEOUT - 1)
      expect(phases(store)).toEqual(['A:exiting', 'B:queued'])
      expect(warn).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1)
      expect(phases(store)).toEqual(['B:entering'])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toContain('"A"')
    })

    it('honors a configured timeout', () => {
      const store = new ToastStore<unknown>({ queue: fifoQueue, exitTimeout: 200 })
      exitingPair(store)

      jest.advanceTimersByTime(199)
      expect(phaseOf(store, 'A')).toBe('exiting')
      jest.advanceTimersByTime(1)
      expect(phaseOf(store, 'A')).toBeUndefined()
      expect(phaseOf(store, 'B')).toBe('entering')
    })

    it('cancels the timeout when exited arrives first', () => {
      const store = createStore()
      exitingPair(store)
      jest.advanceTimersByTime(500)

      store.exited(keyOf(store, 'A'))
      jest.advanceTimersByTime(DEFAULT_EXIT_TIMEOUT * 2)

      expect(warn).not.toHaveBeenCalled()
      expect(phases(store)).toEqual(['B:entering'])
    })

    it('ignores a late exited after the timeout released the slot', () => {
      const store = createStore()
      exitingPair(store)
      const key = keyOf(store, 'A')
      jest.advanceTimersByTime(DEFAULT_EXIT_TIMEOUT)
      const listener = jest.fn()
      store.subscribe(listener)

      store.exited(key)

      expect(listener).not.toHaveBeenCalled()
      expect(phases(store)).toEqual(['B:entering'])
    })

    it('frees the slot without warning when not in development', () => {
      setDev(false)
      const store = createStore()
      exitingPair(store)

      jest.advanceTimersByTime(DEFAULT_EXIT_TIMEOUT)

      expect(phases(store)).toEqual(['B:entering'])
      expect(warn).not.toHaveBeenCalled()
    })

    it('allows reusing the id once the timeout released it', () => {
      const store = createStore()
      store.attach(createHost())
      showVisible(store, 'A')
      store.dismiss('A')
      jest.advanceTimersByTime(DEFAULT_EXIT_TIMEOUT)

      store.show({ id: 'A', title: 'again' })

      expect(store.getSnapshot().toasts).toHaveLength(1)
      expect(store.getSnapshot().toasts[0]).toMatchObject({ id: 'A', title: 'again', phase: 'entering' })
    })

    it.each([0, -5, Number.NaN, Infinity, -Infinity])(
      'falls back to the default timeout and warns for exitTimeout %p',
      (invalid) => {
        const store = new ToastStore<unknown>({ queue: fifoQueue, exitTimeout: invalid })
        expect(warn).toHaveBeenCalledTimes(1)
        store.attach(createHost())
        showVisible(store, 'A')
        store.dismiss('A')

        jest.advanceTimersByTime(DEFAULT_EXIT_TIMEOUT - 1)
        expect(phaseOf(store, 'A')).toBe('exiting')
        jest.advanceTimersByTime(1)
        expect(phaseOf(store, 'A')).toBeUndefined()
      }
    )

    it('does not warn about an invalid exitTimeout outside development', () => {
      setDev(false)

      new ToastStore<unknown>({ queue: fifoQueue, exitTimeout: 0 })

      expect(warn).not.toHaveBeenCalled()
    })

    it('does not warn for a valid exitTimeout', () => {
      new ToastStore<unknown>({ queue: fifoQueue, exitTimeout: 250 })

      expect(warn).not.toHaveBeenCalled()
    })
  })

  describe('lifecycle callbacks', () => {
    it('fires onShow on the first visible, per toast before the host', () => {
      const store = createStore()
      const calls: string[] = []
      const host = createHost()
      host.onShow.mockImplementation(() => calls.push('host'))
      store.attach(host)
      store.show({ id: 'A', title: 'A', onShow: () => calls.push('toast') })
      expect(calls).toEqual([])

      store.markVisible(keyOf(store, 'A'))

      expect(calls).toEqual(['toast', 'host'])
    })

    it('does not fire onShow again on update, replace or a second markVisible', () => {
      const store = createStore()
      const host = createHost()
      store.attach(host)
      showVisible(store, 'A')

      store.update('A', { title: 'x' })
      store.replace('A', { title: 'y' })
      store.markVisible(keyOf(store, 'A'))

      expect(host.onShow).toHaveBeenCalledTimes(1)
    })

    it('passes the record to the callbacks', () => {
      const store = createStore()
      const host = createHost()
      const onShow = jest.fn()
      store.attach(host)
      store.show({ id: 'A', title: 'T', variant: 'error', payload: { n: 1 }, onShow })

      store.markVisible(keyOf(store, 'A'))

      const expected = expect.objectContaining({
        id: 'A',
        title: 'T',
        variant: 'error',
        payload: { n: 1 },
        phase: 'visible'
      })
      expect(onShow).toHaveBeenCalledWith(expected)
      expect(host.onShow).toHaveBeenCalledWith(expected)
    })

    it('fires onHide once when a toast expires', () => {
      const store = createStore()
      const host = createHost(() => 100)
      const onHide = jest.fn()
      store.attach(host)
      store.show({ id: 'A', title: 'A', onHide })
      store.markVisible(keyOf(store, 'A'))

      jest.advanceTimersByTime(100)
      store.dismiss('A')

      expect(onHide).toHaveBeenCalledTimes(1)
      expect(host.onHide).toHaveBeenCalledTimes(1)
    })

    it('fires onHide once when a toast is dismissed manually, twice dismissing is idempotent', () => {
      const store = createStore()
      const host = createHost()
      const calls: string[] = []
      host.onHide.mockImplementation(() => calls.push('host'))
      store.attach(host)
      store.show({ id: 'A', title: 'A', onHide: () => calls.push('toast') })
      store.markVisible(keyOf(store, 'A'))

      store.dismiss('A')
      store.dismiss('A')

      expect(calls).toEqual(['toast', 'host'])
    })

    it('fires no callbacks for a toast closed while entering', () => {
      const store = createStore()
      const host = createHost()
      store.attach(host)
      show(store, 'A')

      store.dismiss('A')

      expect(host.onShow).not.toHaveBeenCalled()
      expect(host.onHide).not.toHaveBeenCalled()
    })

    it('fires no callbacks for a queued toast that is dismissed', () => {
      const store = createStore()
      const host = createHost()
      const onHide = jest.fn()
      store.attach(host)
      showVisible(store, 'A')
      store.show({ id: 'B', title: 'B', onHide })

      store.dismiss('B')

      expect(onHide).not.toHaveBeenCalled()
      expect(host.onHide).not.toHaveBeenCalled()
    })

    it('fires no callbacks for a toast dropped by the strategy', () => {
      const onShow = jest.fn()
      const capping: QueueStrategy = {
        select: ({ occupying, pending }) => ({
          activate: occupying.length === 0 && pending[0] ? [pending[0].id] : [],
          drop: pending.slice(1).map((toast) => toast.id)
        })
      }
      const store = createStore(capping)
      const host = createHost()
      store.attach(host)
      showVisible(store, 'A')

      store.show({ id: 'B', title: 'B', onShow })
      store.show({ id: 'C', title: 'C', onShow })

      expect(onShow).not.toHaveBeenCalled()
      expect(phases(store)).toEqual(['A:visible', 'B:queued'])
    })

    it('runs callbacks after the snapshot is committed and listeners are notified', () => {
      const store = createStore()
      const order: string[] = []
      const host = createHost()
      host.onShow.mockImplementation(() => order.push(`onShow:${phaseOf(store, 'A')}`))
      store.attach(host)
      show(store, 'A')
      store.subscribe(() => order.push('listener'))

      store.markVisible(keyOf(store, 'A'))

      expect(order).toEqual(['listener', 'onShow:visible'])
    })

    it('keeps the queue running when callbacks throw and logs only in development', () => {
      const store = createStore()
      const host = createHost()
      host.onShow.mockImplementation(() => {
        throw new Error('show failed')
      })
      host.onHide.mockImplementation(() => {
        throw new Error('hide failed')
      })
      store.attach(host)
      store.show({
        id: 'A',
        title: 'A',
        onShow: () => {
          throw new Error('toast show failed')
        }
      })
      show(store, 'B')

      store.markVisible(keyOf(store, 'A'))
      expect(phaseOf(store, 'A')).toBe('visible')
      expect(error).toHaveBeenCalledTimes(2)

      store.dismiss('A')
      store.exited(keyOf(store, 'A'))
      expect(phases(store)).toEqual(['B:entering'])
    })

    it('does not log thrown callbacks outside development', () => {
      setDev(false)
      const store = createStore()
      const host = createHost()
      host.onShow.mockImplementation(() => {
        throw new Error('show failed')
      })
      store.attach(host)
      showVisible(store, 'A')

      expect(phaseOf(store, 'A')).toBe('visible')
      expect(error).not.toHaveBeenCalled()
    })
  })
})
