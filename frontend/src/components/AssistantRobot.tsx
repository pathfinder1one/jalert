const ASSISTANT_ROBOT_EMBED =
  'https://sketchfab.com/models/5e7f4e8f7cee4df58bd5759d83d3b509/embed?autostart=1&ui_controls=0&ui_infos=0&ui_stop=0&ui_watermark=0&ui_watermark_link=0&dnt=1';
const ASSISTANT_ROBOT_THUMBNAIL =
  'https://media.sketchfab.com/models/5e7f4e8f7cee4df58bd5759d83d3b509/thumbnails/5119dc1b3d0b4759801c6a7a360485c8/59b33432540d4c908130743830cb6da9.jpeg';
const ASSISTANT_ROBOT_MODEL_URL =
  'https://sketchfab.com/3d-models/cute-robot-5e7f4e8f7cee4df58bd5759d83d3b509';

type AssistantRobotProps = {
  size?: 'sm' | 'md' | 'lg';
  showCredit?: boolean;
  className?: string;
};

export const AssistantRobot = ({
  size = 'md',
  showCredit = false,
  className = '',
}: AssistantRobotProps) => {
  const useThumbnail = size === 'sm' || size === 'md';

  return (
    <div className={`assistant-robot assistant-robot-${size} ${className}`.trim()}>
      {useThumbnail ? (
        <a
          href={ASSISTANT_ROBOT_MODEL_URL}
          target="_blank"
          rel="noreferrer"
          className="assistant-robot-link"
          aria-label="Open the Cute robot model on Sketchfab"
        >
          <img
            src={ASSISTANT_ROBOT_THUMBNAIL}
            alt="Cute robot assistant"
            className="assistant-robot-frame assistant-robot-image"
            loading="lazy"
          />
        </a>
      ) : (
        <iframe
          title="Cute robot assistant"
          className="assistant-robot-frame"
          frameBorder="0"
          allowFullScreen
          allow="autoplay; fullscreen; xr-spatial-tracking"
          loading="lazy"
          src={ASSISTANT_ROBOT_EMBED}
        />
      )}
      {showCredit ? (
        <p className="assistant-robot-credit">
          Model:{' '}
          <a href={ASSISTANT_ROBOT_MODEL_URL} target="_blank" rel="noreferrer">
            Cute robot
          </a>{' '}
          by{' '}
          <a href="https://sketchfab.com/korvanastudio" target="_blank" rel="noreferrer">
            Korvana Studio
          </a>
        </p>
      ) : null}
    </div>
  );
};
