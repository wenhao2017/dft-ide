import { useCallback, useRef, useState } from 'react';
import { openFileInEditor, openObsFileReadOnly, selectPath, validatePath } from '../utils/ipc';

export type PathSelectTarget = 'file' | 'folder';
export type PathSource = 'local' | 'obs';

const defaultPathSources: PathSource[] = ['local', 'obs'];

interface UseVscodePathOptions {
  defaultValue?: string;
  /** 是否在失焦时自动验证路径有效性（优化2） */
  autoValidate?: boolean;
}

export interface PathValidation {
  status: 'idle' | 'validating' | 'valid' | 'invalid';
  message?: string;
}

export interface VscodePathState {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  /** 是否正在等待系统选择器返回（优化2：选择时的反馈状态） */
  selecting: boolean;
  /** 路径验证状态（优化2） */
  validation: PathValidation;
  handleSelect: (targetType?: PathSelectTarget, options?: { rootPath?: string }) => Promise<void>;
  handleOpen: (options?: { targetType?: PathSelectTarget; sources?: PathSource[]; rootPath?: string }) => Promise<void>;
  /** 手动触发路径校验 */
  handleValidate: (options?: { rootPath?: string }) => Promise<void>;
}

export function useVscodePath(options: UseVscodePathOptions = {}): VscodePathState {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [validation, setValidation] = useState<PathValidation>({ status: 'idle' });
  const autoValidate = options.autoValidate ?? true;
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 延迟验证，避免快速输入时频繁调用
  const scheduleValidation = useCallback((pathValue: string) => {
    if (validateTimerRef.current) {
      clearTimeout(validateTimerRef.current);
    }
    const trimmed = pathValue.trim();
    if (!trimmed || trimmed.startsWith('obs://')) {
      setValidation({ status: 'idle' });
      return;
    }
    validateTimerRef.current = setTimeout(async () => {
      setValidation({ status: 'validating' });
      try {
        const result = await validatePath(trimmed);
        if (result.exists) {
          setValidation({
            status: 'valid',
            message: result.isDirectory ? '目录存在' : '文件存在',
          });
        } else {
          setValidation({
            status: 'invalid',
            message: '路径不存在',
          });
        }
      } catch {
        setValidation({ status: 'idle' });
      }
    }, 600);
  }, []);

  const setValueWithValidation: typeof setValue = useCallback((action) => {
    setValue((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (autoValidate && next !== prev) {
        scheduleValidation(next);
      }
      return next;
    });
  }, [autoValidate, scheduleValidation]);

  const handleSelect = useCallback(async (
    targetType: PathSelectTarget = 'file',
    options: { rootPath?: string } = {}
  ) => {
    setSelecting(true);
    setLoading(true);
    try {
      const path = await selectPath(targetType, options.rootPath);
      if (path !== null) {
        setValue(path);
        // 系统选择器返回的路径天然有效
        setValidation({ status: 'valid', message: targetType === 'folder' ? '目录已选择' : '文件已选择' });
      }
    } catch (error) {
      setValidation({
        status: 'invalid',
        message: error instanceof Error ? error.message : '路径选择失败',
      });
    } finally {
      setSelecting(false);
      setLoading(false);
    }
  }, []);

  const handleOpen = useCallback(async (options: { targetType?: PathSelectTarget; sources?: PathSource[]; rootPath?: string } = {}) => {
    const targetType = options.targetType ?? 'file';
    const sources = options.sources ?? defaultPathSources;
    const rootPath = options.rootPath;
    const targetPath = value.trim();
    if (targetPath) {
      if (targetPath.startsWith('obs://')) {
        if (!sources.includes('obs')) {
          return;
        }
        if (targetPath.endsWith('/')) {
          return;
        }
        setLoading(true);
        try {
          await openObsFileReadOnly(targetPath);
        } finally {
          setLoading(false);
        }
        return;
      }
      if (!sources.includes('local')) {
        return;
      }
      if (rootPath) {
        const result = await validatePath(targetPath, rootPath);
        if (!result.exists || result.withinRoot === false) {
          setValidation({
            status: 'invalid',
            message: result.error ?? '路径必须位于当前仓库内',
          });
          return;
        }
      }
      openFileInEditor(targetPath);
      return;
    }

    if (!sources.includes('local')) {
      return;
    }
    setSelecting(true);
    setLoading(true);
    try {
      const path = await selectPath(targetType, rootPath);
      if (path !== null) {
        setValue(path);
        setValidation({ status: 'valid', message: '文件已选择' });
        openFileInEditor(path);
      }
    } catch (error) {
      setValidation({
        status: 'invalid',
        message: error instanceof Error ? error.message : '路径选择失败',
      });
    } finally {
      setSelecting(false);
      setLoading(false);
    }
  }, [value]);

  const handleValidate = useCallback(async (options: { rootPath?: string } = {}) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('obs://')) {
      setValidation({ status: 'idle' });
      return;
    }
    setValidation({ status: 'validating' });
    try {
      const result = await validatePath(trimmed, options.rootPath);
      setValidation({
        status: result.exists ? 'valid' : 'invalid',
        message: result.exists
          ? (result.isDirectory ? '目录存在' : '文件存在')
          : '路径不存在',
      });
    } catch {
      setValidation({ status: 'idle' });
    }
  }, [value]);

  return {
    value,
    setValue: setValueWithValidation,
    loading,
    selecting,
    validation,
    handleSelect,
    handleOpen,
    handleValidate,
  };
}
