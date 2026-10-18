import { mediaUrl } from '../media';

/**
 * Model render (`model`, an `icon3d` capture), else the painted icon from the
 * media manifest, else the emoji fallback from game-data.
 */
export function GameIcon({
  icon,
  image,
  model,
  className,
}: {
  icon: string | undefined;
  image?: string | null | undefined;
  model?: string | null | undefined;
  className?: string;
}) {
  if (model)
    return (
      <img
        className={`game-icon game-icon-model ${className ?? ''}`}
        src={model}
        alt=""
        draggable={false}
      />
    );
  const url = mediaUrl(image);
  if (url)
    return <img className={`game-icon ${className ?? ''}`} src={url} alt="" draggable={false} />;
  return <span className={className}>{icon}</span>;
}
