import * as vscode from 'vscode'

import { getLanderModePipelines } from '../services/landerPipelineService'

import type { LanderStep } from '../services/landerPipelineService'

export interface GetLanderModePipelinesMessage {
  requestId?: unknown

  preMode?: unknown
}

export interface GetLanderModePipelinesResponse {
  command: 'getLanderModePipelinesResponse'

  requestId: string

  success: boolean

  preMode: string

  steps: LanderStep[]

  error?: string
}

const PRE_MODE_PATTERN = /^[A-Za-z0-9_-]+$/

function normalizeRequestId(requestId: unknown): string {
  return typeof requestId === 'string' ? requestId : String(requestId ?? '')
}

function normalizePreMode(preMode: unknown): string {
  return typeof preMode === 'string' ? preMode.trim() : ''
}

async function postResponse(
  panel: vscode.WebviewPanel,
  response: GetLanderModePipelinesResponse,
): Promise<void> {
  await panel.webview.postMessage(response)
}

export async function handleGetLanderModePipelines(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel | undefined,
  msg: GetLanderModePipelinesMessage,
): Promise<void> {
  if (!panel) {
    return
  }

  const requestId = normalizeRequestId(msg.requestId)

  const preMode = normalizePreMode(msg.preMode)

  try {
    if (!preMode) {
      throw new Error('preMode 不能为空')
    }

    if (!PRE_MODE_PATTERN.test(preMode)) {
      throw new Error(`preMode 格式非法: ${preMode}`)
    }

    const steps = await getLanderModePipelines(context.extensionUri, preMode)

    await postResponse(panel, {
      command: 'getLanderModePipelinesResponse',

      requestId,

      success: true,

      preMode,

      steps,
    })
  } catch (error) {
    await postResponse(panel, {
      command: 'getLanderModePipelinesResponse',

      requestId,

      success: false,

      preMode,

      steps: [],

      error: error instanceof Error ? error.message : String(error),
    })
  }
}
