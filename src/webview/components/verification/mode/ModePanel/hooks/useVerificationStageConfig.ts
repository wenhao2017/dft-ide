import { useMemo } from 'react'
import { useFlowConfig } from '../../../../../hooks/useFlowConfig'

export function useVerificationStageConfig() {
  /**
   * 主流程配置
   * verification.json
   */
  const { savedData: verificationConfig, loading: verificationLoading } =
    useFlowConfig('verification')

  /**
   * 获取当前 stage
   *
   * 根据你的流程：
   * step1.stage
   */
  const stage = useMemo(() => {
    if (!verificationConfig) {
      return undefined
    }

    const step1 = verificationConfig.step1

    if (typeof step1 === 'object' && step1 !== null && 'stage' in step1) {
      return String((step1 as Record<string, unknown>).stage)
    }

    return undefined
  }, [verificationConfig])

  /**
   * stage配置
   *
   * verification/{stage}.json
   */
  const {
    savedData: stageConfig,
    loading: stageLoading,
    handleSave,
    handleSync,
  } = useFlowConfig(`verification/${stage}`)

  return {
    stage,

    verificationConfig,

    stageConfig,

    loading: verificationLoading || stageLoading,

    handleSave,

    handleSync,
  }
}
