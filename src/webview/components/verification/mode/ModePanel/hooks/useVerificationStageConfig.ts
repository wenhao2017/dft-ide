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
   * verification.json 顶层的 stage
   */
  const stage = useMemo(() => {
    if (!verificationConfig) {
      return undefined
    }

    if (typeof verificationConfig.stage === 'string') {
      return verificationConfig.stage
    }

    return undefined
  }, [verificationConfig])

  /**
   * stage配置
   *
   * verification/{stage}/{stage}.json
   */
  const {
    savedData: stageConfig,
    loading: stageLoading,
    handleSave,
    handleSync,
  } = useFlowConfig(`verification/${stage}/${stage}`)

  return {
    stage,

    verificationConfig,

    stageConfig,

    loading: verificationLoading || stageLoading,

    handleSave,

    handleSync,
  }
}
