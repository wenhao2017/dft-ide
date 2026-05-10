import React from 'react';
import RepoCloudSubmitPanel from '../shared/RepoCloudSubmitPanel';

interface Props {
  onPrev: () => void;
}

const Step5Cloud: React.FC<Props> = ({ onPrev }) => {
  return <RepoCloudSubmitPanel repo="design" accent="#7c3aed" onPrev={onPrev} />;
};

export default Step5Cloud;
