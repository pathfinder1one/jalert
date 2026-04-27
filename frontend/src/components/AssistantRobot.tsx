import { Suspense, lazy } from 'react';

import type { AssistantRobotSize } from './AssistantRobotScene';

type AssistantRobotProps = {
  size?: AssistantRobotSize;
  showCredit?: boolean;
  className?: string;
  mode?: 'auto' | 'animated' | 'still';
};

const AssistantRobotScene = lazy(() =>
  import('./AssistantRobotScene').then((module) => ({ default: module.AssistantRobotScene })),
);

const RobotFallback = ({ size }: { size: AssistantRobotSize }) => (
  <div className={`assistant-robot-fallback assistant-robot-fallback-${size}`} aria-hidden="true">
    <div className="assistant-robot-fallback-head">
      <span />
      <span />
    </div>
    <div className="assistant-robot-fallback-body">
      <div className="assistant-robot-fallback-core" />
    </div>
  </div>
);

export const AssistantRobot = ({
  size = 'md',
  showCredit = false,
  className = '',
  mode = 'auto',
}: AssistantRobotProps) => {
  const isAnimated = mode === 'animated' || (mode === 'auto' && size !== 'sm');

  return (
    <div className={`assistant-robot assistant-robot-${size} ${className}`.trim()}>
      <div className="assistant-robot-frame" aria-hidden="true">
        <Suspense fallback={<RobotFallback size={size} />}>
          <AssistantRobotScene size={size} animated={isAnimated} />
        </Suspense>
      </div>

      {showCredit ? (
        <p className="assistant-robot-credit">Local 3D assistant presence</p>
      ) : null}
    </div>
  );
};
