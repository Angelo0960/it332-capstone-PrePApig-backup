import ResponsiveImage from './ResponsiveImage.jsx';

/**
 * Full-bleed farm backdrop shared by every screen.
 *
 * Replaces the per-screen `<img src={backgroundImage}>` that pulled an
 * 877 KB PNG on every route; the srcset now serves ~5-13 KB per load.
 */
export default function FarmBackground() {
  return (
    <div className="absolute inset-0">
      <ResponsiveImage
        name="farmBackground"
        sizes="100vw"
        className="w-full h-full object-cover"
        fetchPriority="high"
      />
    </div>
  );
}