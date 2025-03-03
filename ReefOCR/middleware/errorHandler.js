/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error occurred:', err);
  
    // Handle multer errors
    if (err.name === 'MulterError') {
      switch (err.code) {
        case 'LIMIT_FILE_SIZE':
          return res.status(413).json({
            error: 'File too large',
            message: 'The uploaded file exceeds the size limit of 10MB.'
          });
        case 'LIMIT_UNEXPECTED_FILE':
          return res.status(400).json({
            error: 'Unexpected file',
            message: 'Unexpected file field in upload.'
          });
        default:
          return res.status(400).json({
            error: 'File upload error',
            message: 'An error occurred during file upload.'
          });
      }
    }
  
    // Handle OCR errors
    if (err.name === 'OCRError') {
      return res.status(422).json({
        error: 'OCR processing failed',
        message: err.message
      });
    }
  
    // Handle image processing errors
    if (err.name === 'ImageProcessingError') {
      return res.status(422).json({
        error: 'Image processing failed',
        message: err.message,
        suggestions: err.suggestions || ['Try with a clearer image', 'Ensure the document is well-lit']
      });
    }
  
    // Handle Azure API errors
    if (err.name === 'AzureAPIError') {
      return res.status(502).json({
        error: 'Azure service error',
        message: 'An error occurred while communicating with Azure services.'
      });
    }
  
    // Default error response
    res.status(err.status || 500).json({
      error: 'Server error',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : err.message
    });
  };
  
  // Custom error classes
  class OCRError extends Error {
    constructor(message) {
      super(message);
      this.name = 'OCRError';
    }
  }
  
  class ImageProcessingError extends Error {
    constructor(message, suggestions) {
      super(message);
      this.name = 'ImageProcessingError';
      this.suggestions = suggestions;
    }
  }
  
  class AzureAPIError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AzureAPIError';
    }
  }
  
  module.exports = errorHandler;
  module.exports.OCRError = OCRError;
  module.exports.ImageProcessingError = ImageProcessingError;
  module.exports.AzureAPIError = AzureAPIError;