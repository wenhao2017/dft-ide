import React from 'react';
import RepoCloudSubmitPanel from '../shared/RepoCloudSubmitPanel';

const Step5Cloud: React.FC<{ onPrev: () => void }> = ({ onPrev }) => {
  return <RepoCloudSubmitPanel repo="verification" accent="#059669" onPrev={onPrev} />;
};

export default Step5Cloud;
