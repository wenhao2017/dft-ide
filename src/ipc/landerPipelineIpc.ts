import * as vscode from 'vscode'
import * as path from 'path'

import { getLanderModeConfigInfo, getLanderModePipelines } from '../services/landerPipelineService'
import {
  executeLanderStrategy,
  getLanderRunStartStepIndex,
  hasLanderStrategyOutput,
  readLanderStrategyParameters,
} from '../services/landerStrategyService'
import { normalizeStageName, resolveProjectRepoRoot } from '../services/workspaceService'
import type { LanderModeConfigInfo, LanderModeParameters, LanderStep } from '../services/landerPipelineService'

export interface GetLanderModePipelinesMessage {
  requestId?: unknown
  stage?: unknown
  modeName?: unknown
  init?: unknown
}

export interface GetLanderModePipelinesResponse {
  command: 'getLanderModePipelinesResponse'
  requestId: string
  success: boolean
  steps: LanderStep[]
  defaultStartStepIndex: number
  parameters: LanderModeParameters
  error?: string
}

function normalizeModeName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Mode name is required.')
  const modeName = value.trim().replace(/\.cfg$/i, '')
  if (!modeName || modeName === '.' || modeName === '..' || path.basename(modeName) !== modeName) {
    throw new Error(`Invalid Mode name: ${String(value)}`)
  }
  return modeName
}

async function resolveModeConfigPath(stageValue: unknown, modeValue: unknown): Promise<string> {
  const stage = normalizeStageName(stageValue)
  const modeName = normalizeModeName(modeValue)
  const repoRoot = await resolveProjectRepoRoot('verification')
  return path.join(repoRoot, stage, 'lander_env', 'lander_cfg', `${modeName}.cfg`)
}

export async function handleGetLanderModeConfigInfo(
  panel: vscode.WebviewPanel | undefined,
  msg: { requestId?: unknown; stage?: unknown; modeName?: unknown },
): Promise<void> {
  if (!panel) return
  const requestId = typeof msg.requestId === 'string' ? msg.requestId : String(msg.requestId ?? '')

  try {
    const cfgPath = await resolveModeConfigPath(msg.stage, msg.modeName)
    const info: LanderModeConfigInfo = await getLanderModeConfigInfo(cfgPath)
    await panel.webview.postMessage({
      command: 'getLanderModeConfigInfoResponse', requestId, success: true, info,
    })
  } catch (error) {
    await panel.webview.postMessage({
      command: 'getLanderModeConfigInfoResponse', requestId, success: false,
      info: { atpgStage: '', atpgMode: '' },
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function handleGetLanderModePipelines(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel | undefined,
  msg: GetLanderModePipelinesMessage,
): Promise<void> {
  if (!panel) return
  const requestId = typeof msg.requestId === 'string' ? msg.requestId : String(msg.requestId ?? '')

  try {
    let cfgPath: string | undefined
    let parameterContext: { repoRoot: string; stage: string; modeName: string } | undefined
    if (msg.modeName !== undefined) {
      const selectedStage = normalizeStageName(msg.stage)
      const verificationRepoRoot = await resolveProjectRepoRoot('verification')
      const modeName = normalizeModeName(msg.modeName)
      cfgPath = path.join(verificationRepoRoot, selectedStage, 'lander_env', 'lander_cfg', `${modeName}.cfg`)
      parameterContext = { repoRoot: verificationRepoRoot, stage: selectedStage, modeName }
    }
    const [availableSteps, parameters, strategyOutputExists] = await Promise.all([
      getLanderModePipelines(context.extensionUri, cfgPath, {
        init: msg.init === true,
      }),
      parameterContext
        ? readLanderStrategyParameters(
          parameterContext.repoRoot,
          parameterContext.stage,
          parameterContext.modeName,
        )
        : Promise.resolve({ groups: [], tcs: [], subattrs: [] }),
      parameterContext
        ? hasLanderStrategyOutput(
          parameterContext.repoRoot,
          parameterContext.stage,
          parameterContext.modeName,
        )
        : Promise.resolve(false),
    ])
    const defaultStartStepIndex = getLanderRunStartStepIndex(
      availableSteps,
      strategyOutputExists,
    )
    await panel.webview.postMessage({
      command: 'getLanderModePipelinesResponse', requestId, success: true,
      steps: availableSteps, defaultStartStepIndex, parameters,
    })
  } catch (error) {
    await panel.webview.postMessage({
      command: 'getLanderModePipelinesResponse', requestId, success: false, steps: [],
      defaultStartStepIndex: 0,
      parameters: { groups: [], tcs: [], subattrs: [] },
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function handleExecuteLanderStrategy(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel | undefined,
  msg: { requestId?: unknown; stage?: unknown; modeName?: unknown },
): Promise<void> {
  if (!panel) return
  const requestId = typeof msg.requestId === 'string' ? msg.requestId : String(msg.requestId ?? '')

  try {
    const stage = normalizeStageName(msg.stage)
    const modeName = normalizeModeName(msg.modeName)
    const repoRoot = await resolveProjectRepoRoot('verification')
    const cfgPath = path.join(repoRoot, stage, 'lander_env', 'lander_cfg', `${modeName}.cfg`)
    // Reuse the exact parser used by Run so strategy matching always reflects
    // the complete step sequence derived from the current mode.cfg.
    const availableSteps = await getLanderModePipelines(context.extensionUri, cfgPath)
    const result = await executeLanderStrategy({
      repoRoot,
      stage,
      modeName,
      cfgPath,
      availableSteps,
    })

    await panel.webview.postMessage({
      command: 'executeLanderStrategyResponse', requestId, success: true, result,
    })
  } catch (error) {
    await panel.webview.postMessage({
      command: 'executeLanderStrategyResponse', requestId, success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
