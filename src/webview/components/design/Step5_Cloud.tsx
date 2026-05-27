import React from 'react';
import RepoCloudSubmitPanel from '../shared/RepoCloudSubmitPanel';
import type { RepoKey } from '../../utils/ipc';

interface Props {
  onPrev: () => void;
  repo: Extract<RepoKey, 'hibist' | 'sailor'>;
}

const Step5Cloud: React.FC<Props> = ({ onPrev, repo }) => {
  return <RepoCloudSubmitPanel repo={repo} accent="#7c3aed" onPrev={onPrev} />;
};

export default Step5Cloud;
