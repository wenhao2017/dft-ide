import { Modal } from 'antd'

export type DeleteTarget = 'Mode' | 'Module'

export function confirmDelete(target: DeleteTarget, names: string[]): Promise<boolean> {
  const uniqueNames = Array.from(new Set(names.filter(Boolean)))
  if (!uniqueNames.length) return Promise.resolve(false)

  return new Promise((resolve) => {
    let settled = false
    const finish = (confirmed: boolean) => {
      if (settled) return
      settled = true
      resolve(confirmed)
    }

    Modal.confirm({
      centered: true,
      title: `确认删除 ${uniqueNames.length} 个 ${target}？`,
      content: `删除后无法从 DFT IDE 中恢复：${uniqueNames.join('、')}`,
      okText: `删除 ${uniqueNames.length} 项`,
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => finish(true),
      onCancel: () => finish(false),
      afterClose: () => finish(false),
    })
  })
}
