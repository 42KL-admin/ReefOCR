const fs = require('fs');
const path = require('path');
const { processImage } = require('../services/ocrService');
const { downloadImage, createAndSendZipArchive, cleanupTempFiles } = require('../utils/fileUtils');
const config = require('../config');

/**
 * Handle file upload request
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
const handleUpload = async (req, res, next) => {
  console.log('Handling file upload');
  if (!req.file) {
    return res.status(400).send('No file uploaded or file is not an image.');
  }

  const filesToCleanup = [req.file.path];

  try {
    console.log(`Processing uploaded file: ${req.file.path}`);
    const returnJson = req.headers['x-return-json'] === 'true';
    const { jsonPath, excelPath, randomFileName, reports } = await processImage(req.file.path, returnJson);
    
    if (jsonPath) filesToCleanup.push(jsonPath);
    if (excelPath) filesToCleanup.push(excelPath);

    if (returnJson && reports) {
      console.log('Preparing ZIP file with JSON, Excel, and report files');
      
      // Create files to include in the ZIP
      const files = {
        [`${randomFileName}.xlsx`]: excelPath,
        [`${randomFileName}.json`]: jsonPath
      };
      
      // Add reports if available
      if (reports.segmentReport) {
        files[`${randomFileName}_segment_report.csv`] = reports.segmentReport;
      }
      
      if (reports.fieldsReport) {
        files[`${randomFileName}_fields_report.csv`] = reports.fieldsReport;
      }
      
      await createAndSendZipArchive(res, files, randomFileName);
    } else {
      console.log('Sending Excel file to client');
      res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      fs.createReadStream(excelPath).pipe(res);
    }
  } catch (error) {
    next(error); // Pass error to error handling middleware
  } finally {
    console.log(`Cleaning up temporary files`);
    // Delay cleanup slightly to ensure files are fully sent
    setTimeout(() => {
      cleanupTempFiles(filesToCleanup);
    }, 1000);
  }
};

/**
 * Handle URL-based image processing
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 */
const handleImageUrl = async (req, res, next) => {
  console.log('Handling image URL request');
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).send('No URL provided.');
  }

  // Create temporary file path
  const tempFilePath = path.join(__dirname, '..', '..', 'uploads', `temp_${Date.now()}.jpg`);
  const filesToCleanup = [tempFilePath];

  try {
    // Download image from URL
    await downloadImage(url, tempFilePath);
    
    // Process the downloaded image
    console.log(`Processing downloaded image: ${tempFilePath}`);
    const returnJson = req.headers['x-return-json'] === 'true';
    const { jsonPath, excelPath, randomFileName, reports } = await processImage(tempFilePath, returnJson);
    
    if (jsonPath) filesToCleanup.push(jsonPath);
    if (excelPath) filesToCleanup.push(excelPath);

    if (returnJson && reports) {
      console.log('Preparing ZIP file with JSON, Excel, and report files');
      
      // Create files to include in the ZIP
      const files = {
        [`${randomFileName}.xlsx`]: excelPath,
        [`${randomFileName}.json`]: jsonPath
      };
      
      // Add reports if available
      if (reports.segmentReport) {
        files[`${randomFileName}_segment_report.csv`] = reports.segmentReport;
      }
      
      if (reports.fieldsReport) {
        files[`${randomFileName}_fields_report.csv`] = reports.fieldsReport;
      }
      
      await createAndSendZipArchive(res, files, randomFileName);
    } else {
      console.log('Sending Excel file to client');
      res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      fs.createReadStream(excelPath).pipe(res);
    }
  } catch (error) {
    next(error); // Pass error to error handling middleware
  } finally {
    console.log(`Cleaning up temporary files`);
    // Delay cleanup slightly to ensure files are fully sent
    setTimeout(() => {
      cleanupTempFiles(filesToCleanup);
    }, 1000);
  }
};

module.exports = {
  handleUpload,
  handleImageUrl
};