import { responsiveImages } from '../assets/imageManifest.js';

const toSrcSet = (variants) =>
  variants.map((variant) => `${variant.url} ${variant.width}w`).join(', ');

/**
 * Renders one of the generated image sets as AVIF -> WebP -> fallback with a
 * width-based srcset, so a phone fetches the small variant instead of the
 * full-size original.
 *
 * @param {Object} props
 * @param {keyof typeof responsiveImages} props.name - Key in the generated manifest
 * @param {string} props.sizes - The `sizes` hint matching the CSS layout box
 */
export default function ResponsiveImage({ name, sizes = '100vw', className = '', ...rest }) {
  const image = responsiveImages[name];
  if (!image) return null;

  return (
    <picture>
      <source type="image/avif" srcSet={toSrcSet(image.avif)} sizes={sizes} />
      <source type="image/webp" srcSet={toSrcSet(image.webp)} sizes={sizes} />
      <img
        src={image.fallback[0].url}
        srcSet={toSrcSet(image.fallback)}
        sizes={sizes}
        alt={image.alt}
        className={className}
        {...rest}
      />
    </picture>
  );
}