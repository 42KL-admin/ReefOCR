const { AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const fs = require('fs');
const config = require('../config');
const { AzureAPIError, OCRError } = require('../middleware/errorHandler');

/**
 * Create and configure Azure Document Analysis client
 * @returns {DocumentAnalysisClient} Configured Azure client
 */
const createAzureClient = () => {
  try {
    return new DocumentAnalysisClient(
      config.azure.formRecognizerEndpoint,
      new AzureKeyCredential(config.azure.formRecognizerApiKey)
    );
  } catch (error) {
    console.error('Error creating Azure client:', error);
    throw new AzureAPIError('Failed to initialize Azure AI client');
  }
};

/**
 * Analyze document using Azure Form Recognizer
 * @param {string} filePath - Path to the preprocessed image
 * @returns {Promise<object>} Analysis result
 */
const analyzeDocument = async (filePath) => {
  const client = createAzureClient();
  
  try {
    console.log('Creating readable stream for document analysis');
    const readableStream = fs.createReadStream(filePath);
    
    console.log('Beginning document analysis with Azure AI');
    const poller = await client.beginAnalyzeDocument(config.azure.modelId, readableStream);
    
    // Add timeout for long-running operations
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Azure analysis timed out')), 120000); // 2 minute timeout
    });
    
    // Race between the poller and timeout
    const result = await Promise.race([
      poller.pollUntilDone(),
      timeoutPromise
    ]);
    
    console.log('Azure document analysis complete');
    validateAnalysisResult(result);
    
    return result;
  } catch (error) {
    console.error('Error analyzing document with Azure:', error);
    
    if (error.statusCode) {
      // Handle specific Azure API errors
      switch (error.statusCode) {
        case 400:
          throw new OCRError('The document format is not supported or the image is corrupted');
        case 401:
          throw new AzureAPIError('Authentication failed with Azure services');
        case 403:
          throw new AzureAPIError('Not authorized to access Azure services');
        case 429:
          throw new AzureAPIError('Rate limit exceeded with Azure services, please try again later');
        case 500:
        case 503:
          throw new AzureAPIError('Azure service is currently unavailable');
        default:
          throw new AzureAPIError(`Azure API error: ${error.message}`);
      }
    }
    
    if (error.message === 'Azure analysis timed out') {
      throw new OCRError('Azure document analysis timed out. Try with a simpler document or check Azure service status.');
    }
    
    throw new OCRError(`Failed to analyze document: ${error.message}`);
  }
};

/**
 * Validate the analysis result
 * @param {object} result - Analysis result from Azure
 * @throws {OCRError} If the result is invalid
 */
const validateAnalysisResult = (result) => {
  if (!result) {
    throw new OCRError('Empty result from Azure document analysis');
  }
  
  if (!result.documents || result.documents.length === 0) {
    throw new OCRError('No documents detected in the image');
  }
  
  // Check if tables were found (for structured data)
  if (!result.tables || result.tables.length === 0) {
    throw new OCRError('No tables found in the document');
  }
  
  console.log(`Analysis found ${result.documents.length} documents and ${result.tables.length} tables`);
};

module.exports = {
  analyzeDocument
};