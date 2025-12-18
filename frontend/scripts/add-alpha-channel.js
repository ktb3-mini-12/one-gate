#!/usr/bin/env node

/**
 * Add alpha channel to PNG image
 * Uses sharp library to convert RGB PNG to RGBA PNG
 */

const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'resources', 'icon.png');
const tempPath = path.join(__dirname, '..', 'resources', 'icon-temp.png');

// Read the PNG file
const pngData = fs.readFileSync(srcPath);

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.error('Sharp is not installed. Installing temporarily...');
  const { execSync } = require('child_process');
  execSync('npm install --no-save sharp', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  sharp = require('sharp');
}

// Convert to RGBA
sharp(pngData)
  .ensureAlpha()
  .png()
  .toFile(tempPath)
  .then(() => {
    // Replace original with converted version
    fs.renameSync(tempPath, srcPath);
    console.log('✓ Successfully converted icon.png to RGBA format');

    // Verify
    return sharp(srcPath).metadata();
  })
  .then(metadata => {
    console.log(`✓ Image dimensions: ${metadata.width}x${metadata.height}`);
    console.log(`✓ Channels: ${metadata.channels} (4 = RGBA)`);
    console.log(`✓ Has alpha: ${metadata.hasAlpha}`);
  })
  .catch(err => {
    console.error('Error converting PNG:', err.message);
    process.exit(1);
  });
