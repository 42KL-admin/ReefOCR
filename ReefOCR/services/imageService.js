const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { ImageProcessingError } = require('../middleware/errorHandler');

/**
 * Enhanced image preprocessing optimized for OCR
 * 
 * This function applies multiple image processing techniques to improve
 * OCR results, especially for poor quality images.
 * 
 * @param {string} inputPath - Path to the input image
 * @param {string} outputPath - Path to save the processed image
 * @returns {Promise<string>} Path to the processed image
 */
const enhancedPreprocessImage = async (inputPath, outputPath) => {
  try {
    // Get image metadata to determine processing strategy
    const metadata = await sharp(inputPath).metadata();
    
    // Strategy selection based on image characteristics
    if (metadata.width < 800 || metadata.height < 800) {
      console.log('Low resolution image detected, applying upscaling');
      await preprocessLowResImage(inputPath, outputPath, metadata);
    } else if (isDarkImage(metadata)) {
      console.log('Dark image detected, applying brightness enhancement');
      await preprocessDarkImage(inputPath, outputPath);
    } else {
      console.log('Standard image preprocessing');
      await preprocessStandardImage(inputPath, outputPath);
    }
    
    return outputPath;
  } catch (error) {
    console.error('Error preprocessing image:', error);
    throw new ImageProcessingError(
      'Failed to preprocess image for OCR', 
      ['Try with a higher resolution image', 'Ensure proper lighting']
    );
  }
};

/**
 * Check if an image is likely dark based on metadata
 * @param {object} metadata - Sharp image metadata
 * @returns {boolean} True if image is likely dark
 */
const isDarkImage = (metadata) => {
  // In a production environment, we'd analyze the image histogram
  // This is a simplified approach based on available metadata
  return metadata.channels === 3 && metadata.density < 100;
};

/**
 * Process low resolution images
 * @param {string} inputPath - Input image path
 * @param {string} outputPath - Output image path
 * @param {object} metadata - Image metadata
 */
const preprocessLowResImage = async (inputPath, outputPath, metadata) => {
  // Calculate target dimensions for upscaling 
  const targetWidth = Math.max(metadata.width * 2, 1600);
  const targetHeight = Math.max(metadata.height * 2, 1600);
  
  await sharp(inputPath)
    .resize(targetWidth, targetHeight, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill'
    })
    .gamma(1.2)
    .normalize()
    .sharpen({ sigma: 1 })
    .median(1)
    .threshold(128)
    .toColourspace('b-w')
    .toFile(outputPath);
};

/**
 * Process dark images
 * @param {string} inputPath - Input image path
 * @param {string} outputPath - Output image path
 */
const preprocessDarkImage = async (inputPath, outputPath) => {
  await sharp(inputPath)
    .gamma(2.2)
    .normalize({ lower: 20, upper: 80 })
    .modulate({ brightness: 1.5 })
    .sharpen({ sigma: 1.2 })
    .threshold(110)
    .toColourspace('b-w')
    .toFile(outputPath);
};

/**
 * Standard image preprocessing
 * @param {string} inputPath - Input image path
 * @param {string} outputPath - Output image path
 */
const preprocessStandardImage = async (inputPath, outputPath) => {
  await sharp(inputPath)
    .grayscale()
    .normalize()
    .gamma(1.5)
    .sharpen({ sigma: 0.8 })
    .median(1)
    .threshold(128)
    .toColourspace('b-w')
    .toFile(outputPath);
};

/**
 * Apply multiple preprocessing strategies and choose the best result
 * This is a more advanced approach that tries different preprocessing techniques
 * and selects the best result based on OCR confidence (requires integration with OCR service)
 * 
 * @param {string} inputPath - Path to input image
 * @returns {Promise<string>} Path to best preprocessed image
 */
const multiStrategyPreprocessing = async (inputPath) => {
  // This would be implemented in a real system but requires 
  // tight integration with the OCR service to evaluate results
  // For now, we'll just use the enhanced preprocessing
  
  const outputDir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  
  // Apply multiple strategies
  const strategies = [
    {
      name: 'standard',
      outputPath: path.join(outputDir, `${baseName}_standard.tiff`),
      process: async () => preprocessStandardImage(inputPath, path.join(outputDir, `${baseName}_standard.tiff`))
    },
    {
      name: 'dark',
      outputPath: path.join(outputDir, `${baseName}_dark.tiff`),
      process: async () => preprocessDarkImage(inputPath, path.join(outputDir, `${baseName}_dark.tiff`))
    },
    {
      name: 'lowres',
      outputPath: path.join(outputDir, `${baseName}_lowres.tiff`),
      process: async () => preprocessLowResImage(inputPath, path.join(outputDir, `${baseName}_lowres.tiff`), await sharp(inputPath).metadata())
    }
  ];
  
  // Process with all strategies
  await Promise.all(strategies.map(s => s.process()));
  
  // In a real implementation, we would evaluate each result with OCR
  // and choose the best one. For now, just return the standard one.
  return strategies[0].outputPath;
};

module.exports = {
  enhancedPreprocessImage,
  multiStrategyPreprocessing
};