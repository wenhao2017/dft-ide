import { useCallback, useEffect, useRef, useState } from 'react'

import type { ResourceStore } from '../../types'

import { readConfig, syncVerificationModes, watchVerificationModes } from '../../../../../utils/ipc'

import { useVerificationStageConfig } from '../hooks/useVerificationStageConfig'

import { createResourcePatch, readResources } from '../resource'

const EMPTY_RESOURCE: ResourceStore = {
  mode: [],
  focusModes: [],
  group: [],
  tc: [],
  subattr: [],
}

const cloneResources = (store: ResourceStore): ResourceStore => {
  return {
    mode: store.mode.map((item) => ({
      ...item,
    })),

    focusModes: [...store.focusModes],

    group: store.group.map((item) => ({
      ...item,
    })),

    tc: store.tc.map((item) => ({
      ...item,
    })),

    subattr: store.subattr.map((item) => ({
      ...item,
    })),
  }
}

export function useModeResource() {
  const {
    stage,
    stageConfig,
    loading: stageLoading,
    handleSave,
  } = useVerificationStageConfig()

  const [resources, setResources] = useState<ResourceStore>(() =>
    cloneResources(EMPTY_RESOURCE),
  )

  const resourcesRef = useRef<ResourceStore>(cloneResources(EMPTY_RESOURCE))

  const configRef = useRef<Record<string, unknown>>({})

  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const [hydrated, setHydrated] = useState(false)

  const persistResources = useCallback(
    (nextResources: ResourceStore) => {
      const resourcePatch = createResourcePatch(nextResources)

      configRef.current = {
        ...configRef.current,
        ...resourcePatch,
      }

      const saveLatest = async () => {
        const latestConfig = {
          ...configRef.current,
          ...resourcePatch,
        }

        configRef.current = latestConfig

        await handleSave(latestConfig)
      }

      saveQueueRef.current = saveQueueRef.current.then(saveLatest, saveLatest)
    },
    [handleSave],
  )

  const updateResources = useCallback(
    (updater: (current: ResourceStore) => ResourceStore) => {
      const next = updater(resourcesRef.current)

      resourcesRef.current = next

      setResources(next)

      persistResources(next)
    },
    [persistResources],
  )

  useEffect(() => {
    if (stageLoading) {
      return
    }

    const nextConfig = stageConfig ?? {}

    const nextResources = readResources(nextConfig)

    configRef.current = nextConfig

    resourcesRef.current = nextResources

    setResources(nextResources)

    setHydrated(true)
  }, [stageConfig, stageLoading])

  const refreshResources = useCallback(async () => {
    if (!stage) {
      return
    }

    const latestData = await readConfig(`verification/${stage}/${stage}`)

    const nextConfig = latestData ?? {}

    const nextResources = readResources(nextConfig)

    configRef.current = nextConfig

    resourcesRef.current = nextResources

    setResources(nextResources)

    setHydrated(true)
  }, [stage])

  const syncModesFromDirectory = useCallback(async () => {
    if (!stage) return
    const modes = await syncVerificationModes(stage)
    setResources((current) => {
      const validNames = new Set(modes.map((item) => item.name))
      const next = {
        ...current,
        mode: modes,
        focusModes: current.focusModes.filter((name) => validNames.has(name)),
      }
      resourcesRef.current = next
      return next
    })
  }, [stage])

  useEffect(() => {
    if (!stage || stageLoading) return
    let disposed = false
    const sync = () => {
      void syncModesFromDirectory().catch((error) => {
        if (!disposed) console.error('Failed to sync Lander modes', error)
      })
    }
    void watchVerificationModes(stage).then(sync, (error) => {
      if (!disposed) console.error('Failed to watch Lander modes', error)
    })
    const listener = (event: MessageEvent) => {
      if (event.data?.command === 'verificationModesChanged' && event.data?.stage === stage) sync()
    }
    window.addEventListener('message', listener)
    return () => {
      disposed = true
      window.removeEventListener('message', listener)
    }
  }, [stage, stageLoading, syncModesFromDirectory])

  return {
    stage,

    resources,

    resourcesRef,

    hydrated,

    stageLoading,

    updateResources,

    refreshResources,
    syncModesFromDirectory,
  }
}
