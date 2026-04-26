/**
 * useVscodePath — 路径输入字段的状态管理 Hook
 *
 * 提供三种能力：
 *  - handleSelect：弹出 VS Code 文件/目录选择器，将路径填入输入框
 *  - handleOpen：
 *      · 输入框已有路径 → 直接在 VS Code 编辑器中打开该文件
 *      · 输入框为空     → 先弹选择器，用户选择后填入并打开
 *
 * 使用方法（在任意 Step 组件中）：
 *   const myPath = useVscodePath();
 *   <Input value={myPath.value} onChange={e => myPath.setValue(e.target.value)} />
 *   <Button loading={myPath.loading} onClick={myPath.handleSelect}>选择</Button>
 *   <Button loading={myPath.loading} onClick={myPath.handleOpen}>打开</Button>
 */

import { useState, useCallback } from 'react';
import { selectPath, openFileInEditor } from '../utils/ipc';

interface UseVscodePathOptions {
  defaultValue?: string;
}

export interface VscodePathState {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  /** 弹出 VS Code 选择器，将路径填入 value */
  handleSelect: (targetType?: 'file' | 'folder') => Promise<void>;
  /**
   * 如果 value 有值 → 在 VS Code 编辑器打开该文件
   * 如果 value 为空 → 先弹选择器，选择后填入 value 并打开
   */
  handleOpen: () => Promise<void>;
}

export function useVscodePath(options: UseVscodePathOptions = {}): VscodePathState {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const [loading, setLoading] = useState(false);

  const handleSelect = useCallback(async (targetType: 'file' | 'folder' = 'file') => {
    setLoading(true);
    try {
      const path = await selectPath(targetType);
      if (path !== null) setValue(path);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = useCallback(async () => {
    if (value.trim()) {
      // 已有路径：直接打开
      openFileInEditor(value.trim());
    } else {
      // 空路径：先选择，再打开
      setLoading(true);
      try {
        const path = await selectPath('file');
        if (path !== null) {
          setValue(path);
          openFileInEditor(path);
        }
      } finally {
        setLoading(false);
      }
    }
  }, [value]);

  return { value, setValue, loading, handleSelect, handleOpen };
}
