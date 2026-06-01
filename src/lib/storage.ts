import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Compresses an image file to a smaller, web-optimized JPEG format.
 * Downscales images exceeding maxWidth to maxWidth.
 * Returns both the compressed Blob (for Storage) and Base64 string (for Firestore fallback).
 */
async function compressImage(file: File, maxWidth = 600, quality = 0.7): Promise<{ blob: Blob; base64: string }> {
  return new Promise((resolve) => {
    // If not an image, resolve with the original file
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve({ blob: file, base64: reader.result as string });
      reader.onerror = () => resolve({ blob: file, base64: '' });
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Constraint width/height proportions
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ blob: file, base64: event.target?.result as string });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Generate high-performance compressed JPEG representation
        const base64 = canvas.toDataURL('image/jpeg', quality);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, base64 });
            } else {
              resolve({ blob: file, base64: event.target?.result as string });
            }
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => {
        resolve({ blob: file, base64: event.target?.result as string });
      };
    };

    reader.onerror = () => {
      resolve({ blob: file, base64: '' });
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a file to Firebase Storage. Compresses images first.
 * If Firestore bucket or Storage API is disabled, gracefully falls back
 * to returning the compressed Base64 representation directly so it is stored inside Firestore documents safely.
 */
export async function uploadFile(file: File, path: string): Promise<string> {
  let base64Fallback = '';
  try {
    // 1. Optimize image through custom compression
    const { blob, base64 } = await compressImage(file);
    base64Fallback = base64;

    // 2. Try uploading optimized blob to Firebase Storage
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob);
    const url = await getDownloadURL(fileRef);
    console.log("Uploaded successfully to Firebase Storage:", url);
    return url;
  } catch (error: any) {
    console.warn("Firebase Storage unavailable or not initialized. Falling back to secure Base64 Firestore storage:", error);
    // If we have a compressed base64 image representation, return it as a complete fallback url
    if (base64Fallback) {
      return base64Fallback;
    }
    throw new Error(error.message || "Failed to upload file");
  }
}
