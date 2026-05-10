/**
 * useFlowConfig — 流程配置的「读取 / 保存 / Git 同步」一体化 Hook
 *
 * 职责：
 *  1. 组件挂载时自动从本地工作区文件读取配置，回填到表单
 *  2. handleSave(data)  → 将表单数据写入本地 JSON 文件
 *  3. handleSync(data)  → 先保存，再 git add + commit (可选 push)
 *  4. hasUnsaved       → true 表示本地有未提交到 Git 的配置变更
 *  5. debouncedSave    → 防抖自动保存 (优化1)
 *  6. dirty tracking   → 联动 wizardStore 的 dirtyFlows
 *
 * 使用方式：
 *   const { savedData, saving, syncing, hasUnsaved, handleSave, handleSync } =
 *     useFlowConfig('design');
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { saveConfig, readConfig, syncGit } from '../utils/ipc';
import useWizardStore from '../store/wizardStore';

type FlowType = string;

export interface FlowConfigState {
  /** 上次从文件系统读取到的配置，可用于表单的初始回填 */
  savedData: Record<string, unknown> | null;
  /** 是否正在加载配置 */
  loading: boolean;
  /** 是否正在保存中 */
  saving: boolean;
  /** 是否正在同步 Git */
  syncing: boolean;
  /**
   * 本地有未提交 Git 的修改。
   * 每次 handleSave 成功后设为 true，handleSync 成功后设为 false。
   */
  hasUnsaved: boolean;
  /**
   * 保存表单数据到本地配置文件。
   * @param data  当前表单数据（纯对象）
   * @returns     保存成功返回 true
   */
  handleSave: (data: Record<string, unknown>) => Promise<boolean>;
  /**
   * 防抖自动保存（优化1：避免频繁手动保存）。
   * 每次调用后会延迟 1.5 秒执行保存，期间再次调用会重置计时。
   * 注意：不会显示保存成功的 message，静默执行。
   */
  debouncedSave: (data: Record<string, unknown>) => void;
  /**
   * 保存 + Git commit (+可选 push)。
   * @param data  当前表单数据
   * @param commitMessage commit message（可选，不填则自动生成）
   * @param push  是否在 commit 后 push（默认 false）
   */
  handleSync: (data: Record<string, unknown>, commitMessage?: string, push?: boolean) => Promise<boolean>;
  /**
   * 标记当前 flow 有脏数据（优化1）
   */
  markDirty: () => void;
}

export function useFlowConfig(flow: FlowType): FlowConfigState {
  const [savedData, setSavedData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const markDirtyStore = useWizardStore((s) => s.markDirty);
  const clearDirtyStore = useWizardStore((s) => s.clearDirty);

  // 避免组件卸载后还回调 setState
  const mountedRef = useRef(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ── 挂载时读取配置文件 ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    readConfig(flow)
      .then((data) => {
        if (!cancelled && mountedRef.current) {
          setSavedData(data);
        }
      })
      .catch(() => {
        // 读取失败时静默处理，保持 savedData 为 null（相当于首次使用）
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [flow]);

  // ── 保存配置 ──────────────────────────────────────
  const handleSave = useCallback(async (data: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    try {
      const result = await saveConfig(flow, data);
      if (result.success) {
        message.success(`配置已保存${result.filePath ? `（${result.filePath}）` : ''}`);
        setSavedData(data);
        setHasUnsaved(false);
        clearDirtyStore(flow);
        return true;
      } else {
        message.error(`保存失败：${result.error ?? '未知错误'}`);
        return false;
      }
    } catch (e) {
      message.error('保存配置时发生异常，请检查工作区路径');
      return false;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [flow, clearDirtyStore]);

  // ── 防抖自动保存（优化1） ─────────────────────────
  const debouncedSave = useCallback((data: Record<string, unknown>) => {
    // 先标记脏
    setHasUnsaved(true);
    markDirtyStore(flow);
    // 清除之前的计时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      try {
        const result = await saveConfig(flow, data);
        if (result.success && mountedRef.current) {
          setSavedData(data);
          // 自动保存成功后标记已保存（但保留 hasUnsaved = true 直到手动 sync）
        }
      } catch {
        // 静默：自动保存失败不弹 message
      }
    }, 1500);
  }, [flow, markDirtyStore]);

  // ── 标记脏数据（优化1） ──────────────────────────
  const markDirty = useCallback(() => {
    setHasUnsaved(true);
    markDirtyStore(flow);
  }, [flow, markDirtyStore]);

  // ── Git 同步（优化4：使用真正的 syncGit IPC） ──────
  const handleSync = useCallback(async (
    data: Record<string, unknown>,
    commitMessage?: string,
    push = false
  ): Promise<boolean> => {
    setSyncing(true);
    try {
      // 先保存到本地
      const saveResult = await saveConfig(flow, data);
      if (!saveResult.success) {
        message.error(`保存失败：${saveResult.error ?? '未知错误'}`);
        return false;
      }
      setSavedData(data);

      // 然后 Git commit (+可选 push)
      const gitResult = await syncGit(flow, commitMessage, push);
      if (gitResult.success) {
        message.success(
          `已提交到 Git${gitResult.commitMessage ? `：${gitResult.commitMessage}` : ''}`
        );
        setHasUnsaved(false);
        clearDirtyStore(flow);
        return true;
      } else {
        message.error(`Git 同步失败：${gitResult.error ?? '未知错误'}`);
        // 保存成功但 Git 失败，仍标记为已修改
        setHasUnsaved(true);
        return false;
      }
    } catch (e) {
      message.error('Git 同步时发生异常');
      return false;
    } finally {
      if (mountedRef.current) setSyncing(false);
    }
  }, [flow, clearDirtyStore]);

  return { savedData, loading, saving, syncing, hasUnsaved, handleSave, debouncedSave, handleSync, markDirty };
}
