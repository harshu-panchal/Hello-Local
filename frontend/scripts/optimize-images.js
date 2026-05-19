import Jimp from 'jimp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const imagesToOptimize = [
  { relPath: 'public/assets/deliveryboy/deliveryIcon.png', maxWidth: 256 },
  { relPath: 'public/assets/login/loginvideo.png', maxWidth: 800 },
  { relPath: 'public/assets/delivery.png', maxWidth: 512 },
  { relPath: 'public/assets/dhakadsnazzy1.png', maxWidth: 800 },
  { relPath: 'public/assets/dhakadsnazzy2.png', maxWidth: 800 },
  { relPath: 'public/assets/happy.png', maxWidth: 512 },
  { relPath: 'public/assets/hello.png', maxWidth: 512 },
  { relPath: 'public/assets/order.png', maxWidth: 512 },
  { relPath: 'public/logo.png', maxWidth: 192 },
  { relPath: 'public/logo192.png', maxWidth: 192 },
  { relPath: 'public/logo512.png', maxWidth: 512 },
  { relPath: 'public/chatbot-icon.png', maxWidth: 256 },
  { relPath: 'public/splash.png', maxWidth: 512 },
  // Also optimize in assets
  { relPath: 'assets/deliveryboy/deliveryIcon.png', maxWidth: 256 },
  { relPath: 'assets/login/loginvideo.png', maxWidth: 800 },
  { relPath: 'assets/delivery.png', maxWidth: 512 },
  { relPath: 'assets/dhakadsnazzy1.png', maxWidth: 800 },
  { relPath: 'assets/dhakadsnazzy2.png', maxWidth: 800 },
  { relPath: 'assets/happy.png', maxWidth: 512 },
  { relPath: 'assets/hello.png', maxWidth: 512 },
  { relPath: 'assets/order.png', maxWidth: 512 },
];

async function optimize() {
  console.log('Starting image optimization...');
  for (const img of imagesToOptimize) {
    const fullPath = path.join(rootDir, img.relPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`File not found: ${img.relPath}`);
      continue;
    }

    try {
      const originalSize = fs.statSync(fullPath).size;
      const image = await Jimp.read(fullPath);
      
      const width = image.bitmap.width;
      const height = image.bitmap.height;

      if (width > img.maxWidth) {
        console.log(`Resizing ${img.relPath} from ${width}x${height} to max width ${img.maxWidth}...`);
        image.resize(img.maxWidth, Jimp.AUTO);
      }

      // Set quality
      image.quality(75);
      
      // Write back
      await image.writeAsync(fullPath);
      const newSize = fs.statSync(fullPath).size;
      const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);
      console.log(`Optimized ${img.relPath}: ${(originalSize / 1024).toFixed(1)}KB -> ${(newSize / 1024).toFixed(1)}KB (${reduction}% smaller)`);
    } catch (err) {
      console.error(`Failed to optimize ${img.relPath}:`, err.message);
    }
  }
  console.log('Image optimization completed!');
}

optimize();
