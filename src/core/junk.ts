/** System clutter that isn't the user's content: hidden in folder and archive listings. */
export const isJunkPath = (path: string): boolean => {
  const parts = path.split('/').filter(Boolean);
  const name = parts[parts.length - 1] ?? '';
  return parts.includes('__MACOSX') || name.startsWith('._') || /^(\.DS_Store|Thumbs\.db|desktop\.ini|\.localized)$/i.test(name);
};
