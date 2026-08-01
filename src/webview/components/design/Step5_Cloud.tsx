import React from 'react';
import RepoCloudSubmitPanel from '../shared/RepoCloudSubmitPanel';
import type { RepoKey } from '../../utils/ipc';
import { DESIGN_FLOW_ACCENTS } from '../../flowTheme';

interface Props {
  onPrev: () => void;
  repo: Extract<RepoKey, 'hibist' | 'sailor'>;
}

const Step5Cloud: React.FC<Props> = ({ onPrev, repo }) => {
  return <RepoCloudSubmitPanel repo={repo} accent={DESIGN_FLOW_ACCENTS[repo]} onPrev={onPrev} />;
};

export default Step5Cloud;
