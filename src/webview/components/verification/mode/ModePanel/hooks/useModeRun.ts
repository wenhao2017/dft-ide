import { useCallback, useState } from 'react'

import type { ModeConfigItem, ModeRunPayload } from '../../types'

interface UseModeRunProps {
  onRun?: (payload: ModeRunPayload) => void

  onStop?: (names: string[]) => void
}

export function useModeRun({ onRun, onStop }: UseModeRunProps) {
  const [runOpen, setRunOpen] = useState(false)

  const [runMode, setRunMode] = useState<ModeConfigItem>()

  const [runningNames, setRunningNames] = useState<string[]>([])

  const openRun = useCallback((mode: ModeConfigItem) => {
    if (!mode.name) {
      return
    }

    if (!mode.preMode?.trim()) {
      return
    }

    setRunMode(mode)
    setRunOpen(true)
  }, [])

  const closeRun = useCallback(() => {
    setRunOpen(false)
    setRunMode(undefined)
  }, [])

  const handleRun = useCallback(
    (payload: ModeRunPayload) => {
      const modeName = payload.mode?.name

      if (!modeName) {
        return
      }

      setRunningNames((current) => Array.from(new Set([...current, modeName])))

      closeRun()

      onRun?.(payload)
    },
    [closeRun, onRun],
  )

  const stopModes = useCallback(
    (names: string[]) => {
      const normalizedNames = Array.from(new Set(names.filter(Boolean)))

      if (!normalizedNames.length) {
        return
      }

      const stopSet = new Set(normalizedNames)

      setRunningNames((current) => current.filter((name) => !stopSet.has(name)))

      onStop?.(normalizedNames)
    },
    [onStop],
  )

  const isRunning = useCallback(
    (name: string) => {
      return runningNames.includes(name)
    },
    [runningNames],
  )

  return {
    runOpen,

    runMode,

    runningNames,

    /**
     * useModeCrud 当前需要这个 setter，
     * 必须返回。
     */
    setRunningNames,

    openRun,

    closeRun,

    handleRun,

    stopModes,

    isRunning,
  }
}
