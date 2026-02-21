const Jimp = require('jimp');
const path = require('path');

const LOGO_PATH = path.join('public', 'logo.png');
const ASSETS_LOGO_PATH = path.join('assets', 'logo.png');

async function processLogo() {
    try {
        console.log(`Processing ${LOGO_PATH}...`);
        const image = await Jimp.read(LOGO_PATH);

        const width = image.bitmap.width;
        const height = image.bitmap.height;

        let minX = width, minY = height, maxX = 0, maxY = 0;
        let found = false;

        // Find bounding box of non-black pixels
        image.scan(0, 0, width, height, function (x, y, idx) {
            const r = this.bitmap.data[idx + 0];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];
            const a = this.bitmap.data[idx + 3];

            // If not black (or very close to it) and not already transparent
            if ((r > 30 || g > 30 || b > 30) && a > 0) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
                found = true;
            }
        });

        if (found) {
            console.log(`Bounding box: (${minX}, ${minY}) to (${maxX}, ${maxY})`);

            // Add a small 1px margin
            minX = Math.max(0, minX - 1);
            minY = Math.max(0, minY - 1);
            maxX = Math.min(width - 1, maxX + 1);
            maxY = Math.min(height - 1, maxY + 1);

            const cropWidth = maxX - minX + 1;
            const cropHeight = maxY - minY + 1;

            image.crop(minX, minY, cropWidth, cropHeight);

            // Now make black pixels transparent in the cropped image
            image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
                const r = this.bitmap.data[idx + 0];
                const g = this.bitmap.data[idx + 1];
                const b = this.bitmap.data[idx + 2];
                if (r < 30 && g < 30 && b < 30) {
                    this.bitmap.data[idx + 3] = 0; // Set alpha to 0
                }
            });

            // Save to both locations
            await image.writeAsync(LOGO_PATH);
            await image.writeAsync(ASSETS_LOGO_PATH);
            console.log('Logo cropped and background removed successfully.');
        } else {
            console.log('No non-black pixels found.');
        }

    } catch (error) {
        console.error('Error processing logo:', error);
    }
}

processLogo();
