const fs = require('fs');
const path = require('path');
const { analyzeDocument } = require('./azureService');
const { enhancedPreprocessImage } = require('./imageService');
const { generateExcelReport, generateCSVReports } = require('./reportService');
const { extractFields, isOldVersion, processSegmentData } = require('../utils/dataUtils');
const { generateUniqueFileName, cleanupTempFiles } = require('../utils/fileUtils');
const { OCRError } = require('../middleware/errorHandler');

/**
 * Process an image through the OCR pipeline
 * @param {string} filePath - Path to the input image
 * @param {boolean} returnJson - Whether to return JSON data along with Excel
 * @returns {Promise<object>} Processing results with file paths
 */
const processImage = async (filePath, returnJson = false) => {
  console.log(`Processing image: ${filePath}`);
  
  // Track temporary files for cleanup
  const tempFiles = [];
  
  try {
    // 1. Preprocess the image to improve OCR accuracy
    const preprocessedPath = `${filePath}-preprocessed.tiff`;
    tempFiles.push(preprocessedPath);
    await enhancedPreprocessImage(filePath, preprocessedPath);
    
    // 2. Analyze document with Azure Form Recognizer
    const result = await analyzeDocument(preprocessedPath);
    
    // 3. Extract and process data
    const fields = extractFields(result.documents[0]?.fields || {});
    const tables = result.tables || [];
    
    // Check if this is an old or new version of the document
    const oldVersion = isOldVersion(fields);
    
    // Process segment data if it's an old version
    let segmentData = null;
    if (oldVersion && tables.length > 0) {
      segmentData = processSegmentData(tables[0]);
    }
    
    // 4. Generate Excel report
    const {
      jsonPath,
      excelPath,
      randomFileName,
      reportData
    } = await generateExcelReport(fields, tables, segmentData, oldVersion);
    
    // 5. Save the raw OCR JSON result if requested
    if (returnJson) {
      // Ensure the output directory exists
      const outputDir = path.dirname(jsonPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    }
    
    // 6. Generate CSV reports if needed
    let reports = null;
    if (reportData) {
      reports = generateCSVReports(reportData);
    }
    
    return {
      jsonPath: returnJson ? jsonPath : null,
      excelPath,
      randomFileName,
      reports
    };
  } catch (error) {
    console.error('Error in OCR processing pipeline:', error);
    
    // If it's not already a custom error, wrap it
    if (!(error instanceof OCRError)) {
      throw new OCRError(`OCR processing failed: ${error.message}`);
    }
    
    throw error;
  } finally {
    // Clean up temporary files
    cleanupTempFiles(tempFiles);
  }
};

module.exports = {
  processImage
};