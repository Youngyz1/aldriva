// Minimum size for organizer banner uploads — small source images stretched
// across a ~1400px-wide, 300-360px-tall banner slot via object-cover visibly
// blur (confirmed on a real 256x256 banner in production). Doesn't touch
// already-uploaded banners, only new ones going forward.
export const MIN_BANNER_WIDTH = 1200;
export const MIN_BANNER_HEIGHT = 300;

export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions."));
    };
    img.src = url;
  });
}
