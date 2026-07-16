import * as vscode from 'vscode'

import yaml from 'yaml'
import { z } from 'zod'

const PRE_MODE_PATTERN = /^[A-Za-z0-9_-]+$/

const booleanWithDefaultFalse = z.boolean().optional().default(false)

export const landerStepSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),

  name: z.string().trim().min(1, 'name 不能为空'),

  command: z.string().trim().min(1, 'command 不能为空'),

  description: z.string().default(''),

  enableGroup: booleanWithDefaultFalse,

  enableTC: booleanWithDefaultFalse,

  enableSubAttr: booleanWithDefaultFalse,
})

export type LanderStep = z.infer<typeof landerStepSchema>

/**
 * 当前 YAML 顶层直接是 Step 数组：
 *
 * - id: create_project
 *   name: create_project
 *   command: ...
 */
const landerPipelineSchema = z.array(landerStepSchema)

export async function getLanderModePipelines(
  extensionUri: vscode.Uri,
  preMode: string,
): Promise<LanderStep[]> {
  const normalizedPreMode = preMode.trim()

  if (!normalizedPreMode) {
    throw new Error('preMode 不能为空')
  }

  if (!PRE_MODE_PATTERN.test(normalizedPreMode)) {
    throw new Error(`preMode 格式非法: ${normalizedPreMode}`)
  }

  const pipelineUri = vscode.Uri.joinPath(
    extensionUri,
    'pipelines',
    `lander_${normalizedPreMode}.yaml`,
  )

  let content: string

  try {
    const bytes = await vscode.workspace.fs.readFile(pipelineUri)

    content = new TextDecoder('utf-8').decode(bytes)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    throw new Error(`找不到 pipeline 文件: ${pipelineUri.fsPath}；${reason}`)
  }

  let yamlData: unknown

  try {
    yamlData = yaml.parse(content)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    throw new Error(`pipeline YAML 解析失败: ${pipelineUri.fsPath}；${reason}`)
  }

  const result = landerPipelineSchema.safeParse(yamlData)

  if (!result.success) {
    throw new Error(`lander pipeline 格式错误: ${result.error.message}`)
  }

  return result.data
}
