import { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

// ===============================
// DownloadImages Component
// ===============================
const DownloadImages = () => {
  const [isDownloading, setIsDownloading] = useState(false);

  // ============================================
  // Runs INSIDE the webpage to extract <img> src
  // ============================================
  const getAllImageUrls = () => {
    const images = Array.from(document.querySelectorAll("img"));
    return images
      .map((img) => {
        const src = img.src;
        const ext = src.split(".").pop()?.split(/#|\?/)[0];
        return { src, ext };
      })
      .filter(({ src, ext }) => src && ext);
  };

  // ============================================
  // Fetch image as Blob
  // ============================================
  const fetchImageAsBlob = async (url: string): Promise<Blob | null> => {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.blob();
      }
      console.error(`Failed to fetch image from ${url}`);
      return null;
    } catch (error) {
      console.error(`Error fetching image from ${url}:`, error);
      return null;
    }
  };

  // ============================================
  // ZIP Creation
  // ============================================
  const DownloadImagesAsZip = async (
    imageUrls: { src: string; ext?: string }[]
  ) => {
    const zip = new JSZip();
    const imgFolder = zip.folder("images");

    const validImages = await Promise.all(
      imageUrls.map(async ({ src, ext }, index) => {
        const imageBlob = await fetchImageAsBlob(src);
        if (imageBlob && ext) {
          imgFolder?.file(`image_${index + 1}.${ext}`, imageBlob);
          return true;
        }
        return false;
      })
    );

    if (validImages.some(Boolean)) {
      zip.generateAsync({ type: "blob" }).then((content) => {
        saveAs(content, "images.zip");
        setIsDownloading(false);
      });
    } else {
      console.warn("No valid images to download.");
      setIsDownloading(false);
    }
  };

  // ============================================
  // Main Handler
  // ============================================
  const handleDownloadImages = async () => {
    setIsDownloading(true);

    chrome.tabs.query(
      { active: true, currentWindow: true },
      (tabs: chrome.tabs.Tab[]) => {
        if (!tabs[0]?.id) {
          console.warn("No active tab found.");
          setIsDownloading(false);
          return;
        }

        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            func: getAllImageUrls,
          },
          (results: chrome.scripting.InjectionResult[]) => {
            if (results && results[0]?.result?.length) {
              const imageUrls = results[0].result as {
                src: string;
                ext?: string;
              }[];

              DownloadImagesAsZip(imageUrls);
            } else {
              console.warn("No images found on the page.");
              setIsDownloading(false);
            }
          }
        );
      }
    );
  };

  // ============================================
  // UI
  // ============================================
  return (
    <div style={{ padding: "10px" }}>
      <button onClick={handleDownloadImages} disabled={isDownloading}>
        {isDownloading ? "Working..." : "Download Images"}
      </button>
    </div>
  );
};

export default DownloadImages;
