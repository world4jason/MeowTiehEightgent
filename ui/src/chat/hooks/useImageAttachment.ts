import { useState, useCallback } from "react";

export interface AttachedImage {
  file: File;
  base64: string;
  preview: string; // object URL for display
}

export function useImageAttachment(supportsImage: boolean) {
  const [images, setImages] = useState<AttachedImage[]>([]);

  const attach = useCallback(async (file: File) => {
    if (!supportsImage) return;
    const base64 = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res((reader.result as string).split(",")[1]!);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    const preview = URL.createObjectURL(file);
    setImages((prev) => [...prev, { file, base64, preview }]);
  }, [supportsImage]);

  const remove = useCallback((idx: number) => {
    setImages((prev) => {
      const item = prev[idx];
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const clear = useCallback(() => {
    setImages((prev) => { prev.forEach((i) => URL.revokeObjectURL(i.preview)); return []; });
  }, []);

  return { images, attach, remove, clear };
}
