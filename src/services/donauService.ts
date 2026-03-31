/**
 * Donau Service — 封装 mock 的 dsub/djob 调用
 * 在扩展宿主( Node )侧运行
 */

/**
 * 模拟提交任务到 Donau HPC 集群
 * @param payload 任务配置 payload
 * @returns 随机生成的 Mock JobID
 */
export function submitJob(payload: any): string {
  const jobId = `Job-${Math.floor(1000 + Math.random() * 9000)}`;
  console.log(`[DonauService] submitJob 收到配置:`, JSON.stringify(payload, null, 2));
  console.log(`[DonauService] 已提交任务，JobID = ${jobId}`);
  return jobId;
}

/**
 * 模拟轮询任务状态
 * @param jobId 任务 ID
 * @returns 当前任务状态对象
 */
export function queryJobStatus(jobId: string): {
  jobId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  progress: number;
} {
  const progress = Math.floor(Math.random() * 100);
  const status = progress >= 100 ? 'SUCCESS' : 'RUNNING';
  return { jobId, status, progress };
}
