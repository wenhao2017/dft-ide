import { useCallback, useState } from 'react';
import { openFileInEditor, openObsFileReadOnly, selectPath } from '../utils/ipc';

interface UseVscodePathOptions {
  defaultValue?: string;
}

export interface VscodePathState {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  handleSelect: (targetType?: 'file' | 'folder') => Promise<void>;
  handleOpen: () => Promise<void>;
}

export function useVscodePath(options: UseVscodePathOptions = {}): VscodePathState {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const [loading, setLoading] = useState(false);

  const handleSelect = useCallback(async (targetType: 'file' | 'folder' = 'file') => {
    setLoading(true);
    try {
      const path = await selectPath(targetType);
      if (path !== null) {
        setValue(path);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = useCallback(async () => {
    const targetPath = value.trim();
    if (targetPath) {
      if (targetPath.startsWith('obs://')) {
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
      openFileInEditor(targetPath);
      return;
    }

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
  }, [value]);

  return { value, setValue, loading, handleSelect, handleOpen };
}
