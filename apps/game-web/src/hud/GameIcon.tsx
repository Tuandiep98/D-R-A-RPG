import { mediaUrl } from '../media';

/** Painted icon from the media manifest, or the emoji fallback from game-data. */
export function GameIcon({
  icon,
  image,
  className,
}: {
  icon: string | undefined;
  image?: string | null | undefined;
  className?: string;
}) {
  const url = mediaUrl(image);
  if (url)
    return <img className={`game-icon ${className ?? ''}`} src={url} alt="" draggable={false} />;
  return <span className={className}>{icon}</span>;
}
