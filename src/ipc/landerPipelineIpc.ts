import * as vscode from 'vscode'
import * as path from 'path'

import { getLanderModePipelines } from '../services/landerPipelineService'
import { normalizeStageName, resolveProjectRepoRoot } from '../services/workspaceService'
import type { LanderStep } from '../services/landerPipelineService'

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
  error?: string
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
    if (msg.modeName !== undefined) {
      if (typeof msg.modeName !== 'string') throw new Error('Mode name is required.')
      const modeName = msg.modeName.trim().replace(/\.cfg$/i, '')
      if (!modeName || modeName === '.' || modeName === '..' || path.basename(modeName) !== modeName) {
        throw new Error(`Invalid Mode name: ${String(msg.modeName)}`)
      }
      const stage = normalizeStageName(msg.stage)
      const repoRoot = await resolveProjectRepoRoot('verification')
      cfgPath = path.join(repoRoot, stage, 'lander_env', 'lander_cfg', `${modeName}.cfg`)
    }
    const steps = await getLanderModePipelines(context.extensionUri, cfgPath, {
      init: msg.init === true,
    })
    await panel.webview.postMessage({ command: 'getLanderModePipelinesResponse', requestId, success: true, steps })
  } catch (error) {
    await panel.webview.postMessage({
      command: 'getLanderModePipelinesResponse', requestId, success: false, steps: [],
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
