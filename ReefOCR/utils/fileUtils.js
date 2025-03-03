const fs = require('fs');
const path = require('path');
const axios = require('axios');
const archiver = require('archiver');
const config = require('../config');

/**
 * Generate a unique filename for output files
 * @param {string} dir - Directory where file will be saved
 * @returns {string} Generated unique filename without extension
 */
const generateUniqueFileName = (dir) => {
  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let fileName;
  do {
    // Generate a random string
    fileName = Math.random().toString(36).substring(2, 7) + '_' + Date.now().toString(36);
  } while (
    fs.existsSync(path.join(dir, `${fileName}.json`)) || 
    fs.existsSync(path.join(dir, `${fileName}.xlsx`))
  );
  return fileName;
};

/**
 * Download an image from a URL to a local file
 * @param {string} url - URL of the image to download
 * @param {string} filePath - Path where the image will be saved
 * @returns {Promise<void>}
 */
const downloadImage = async (url, filePath) => {
  console.log(`Downloading image from URL: ${url}`);
  
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 30000, // 30 second timeout
    });

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      writer.on('finish', () => {
        console.log(`Image downloaded and saved to: ${filePath}`);
        resolve();
      });
      writer.on('error', (error) => {
        console.error(`Error downloading image: ${error.message}`);
        reject(error);
      });
    });
  } catch (error) {
    console.error(`Error downloading image: ${error.message}`);
    throw error;
  }
};

/**
 * Create a ZIP archive with multiple files
 * @param {object} res - Express response object to pipe the ZIP to
 * @param {object} files - Object mapping filenames to file paths
 * @param {string} zipFileName - Name for the ZIP file
 * @returns {Promise<void>}
 */
const createAndSendZipArchive = (res, files, zipFileName) => {
  return new Promise((resolve, reject) => {
    console.log('Creating ZIP archive');
    
    res.setHeader('Content-Disposition', `attachment; filename=${zipFileName}.zip`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    Object.entries(files).forEach(([name, content]) => {
      if (typeof content === 'string' && !fs.existsSync(content)) {
        // If content is a string but not a file path, add it as buffer
        archive.append(content, { name });
      } else {
        // If content is a file path, add the file
        archive.file(content, { name });
      }
    });

    archive.on('error', (err) => {
      console.error('Error creating ZIP archive:', err);
      reject(err);
    });

    archive.on('finish', () => {
      console.log('ZIP archive created and sent');
      resolve();
    });

    archive.finalize();
  });
};

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dir - Directory path
 */
const ensureDirectoryExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Clean up temporary files
 * @param {string[]} filePaths - Array of file paths to delete
 */
const cleanupTempFiles = (filePaths) => {
  filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`Deleted temporary file: ${filePath}`);
      } catch (error) {
        console.error(`Error deleting temporary file ${filePath}:`, error);
      }
    }
  });
};

module.exports = {
  generateUniqueFileName,
  downloadImage,
  createAndSendZipArchive,
  ensureDirectoryExists,
  cleanupTempFiles
};