const config = require('../config');

/**
 * Removes ':selected:' tag from OCR output
 * @param {string|null} value - Value from OCR output
 * @returns {string} Cleaned value
 */
const removeSelected = (value) => {
  if (typeof value === 'string') {
    return value.replace(/:selected:/g, '').trim();
  }
  return value || '';
};

/**
 * Extract field data from OCR results
 * @param {object} fields - Fields object from OCR result
 * @returns {object} Extracted and processed fields
 */
const extractFields = (fields = {}) => ({
  location: removeSelected(fields.Location?.value) || 'N/A',
  islandCountry: removeSelected(fields["Island/Country"]?.value) || 'N/A',
  date: removeSelected(fields.Date?.value) || 'N/A',
  teamLeader: removeSelected(fields["Team Leader"]?.value) || 'N/A',
  timeOfDive: removeSelected(fields["Time of Dive"]?.value) || 'N/A',
  divedDepth: removeSelected(fields["Dived Depth"]?.value) || 'N/A',
  nameOfDiver: removeSelected(fields["Name Of Diver"]?.value) || 'N/A',
});

/**
 * Determine if result is from older format document
 * @param {object} fields - Extracted fields
 * @returns {boolean} True if old version detected
 */
const isOldVersion = (fields) => {
  return Object.values(fields).some(value => value !== 'N/A');
};

/**
 * Process segment data from table
 * @param {object} table - Table object from OCR result
 * @returns {object} Processed segment data
 */
const processSegmentData = (table) => {
  const segmentData = {
    1: { range: '0 - 19.5 m', data: [] },
    2: { range: '25 - 44.5 m', data: [] },
    3: { range: '50 - 69.5 m', data: [] },
    4: { range: '75 - 94.5 m', data: [] }
  };
  const lastValidContent = {};

  if (!table || !table.cells) {
    console.error('Invalid table structure');
    return segmentData;
  }

  table.cells.forEach(cell => {
    if (!cell || typeof cell.rowIndex === 'undefined' || typeof cell.columnIndex === 'undefined') {
      console.error('Invalid cell structure:', cell);
      return;
    }

    const { rowIndex, columnIndex, content } = cell;
    if (rowIndex === 0) return;  // Skip header row

    const segment = Math.floor(columnIndex / 2) + 1;
    if (segment < 1 || segment > 4) {
      console.error(`Invalid segment number: ${segment}`);
      return;
    }

    const isDepth = columnIndex % 2 === 0;
    
    if (!lastValidContent[segment]) {
      lastValidContent[segment] = null;
    }

    let processedContent = removeSelected((content || '').trim());
    let isBlank = processedContent === '';
    let filledFromAbove = false;

    if (!isDepth) {
      // Process substrate code
      if (isBlank && lastValidContent[segment]) {
        processedContent = lastValidContent[segment];
        filledFromAbove = true;
      }

      const isValid = config.validSubstrateCodes.hasOwnProperty(processedContent.toUpperCase());
      
      if (isValid && !isBlank) {
        lastValidContent[segment] = processedContent;
      }

      const depth = removeSelected(table.cells.find(c => 
        c.rowIndex === rowIndex && c.columnIndex === (columnIndex - 1))?.content || '');
      
      segmentData[segment].data.push({
        depth,
        content: processedContent,
        isValid,
        isBlank,
        filledFromAbove
      });
    }
  });

  return segmentData;
};

/**
 * Calculate statistics on segment data
 * @param {object} segmentData - Processed segment data
 * @returns {object} Statistics about the data
 */
const calculateStats = (segmentData) => {
  let totalCells = 0;
  let validCells = 0;
  let invalidCells = 0;
  let filledCells = 0;

  Object.values(segmentData).forEach(segment => {
    segment.data.forEach(cell => {
      totalCells++;
      if (cell.isValid) validCells++;
      if (!cell.isValid && !cell.filledFromAbove) invalidCells++;
      if (cell.filledFromAbove) filledCells++;
    });
  });

  return { totalCells, validCells, invalidCells, filledCells };
};

/**
 * Generate detailed report from segment data
 * @param {object} segmentData - Processed segment data
 * @param {object} fields - Extracted fields
 * @returns {object} Report data
 */
const generateDetailedReport = (segmentData, fields) => {
  const reportData = [];
  
  Object.entries(segmentData).forEach(([segment, data]) => {
    data.data.forEach((cell) => {
      if (!cell.isValid || cell.filledFromAbove) {
        reportData.push({
          segment: segment,
          depth: removeSelected(cell.depth),
          originalContent: cell.isBlank ? '' : removeSelected(cell.content),
          processedContent: removeSelected(cell.content),
          isValid: cell.isValid ? 'Yes' : 'No',
          filledFromAbove: cell.filledFromAbove ? 'Yes' : 'No',
          issue: cell.isValid ? (cell.filledFromAbove ? 'Filled from above' : '') : 'Invalid substrate code'
        });
      }
    });
  });

  const fieldReport = Object.entries(fields).map(([key, value]) => ({
    field: key,
    value: removeSelected(value),
    issue: value === 'N/A' ? 'Missing or unrecognized' : ''
  }));

  return { reportData, fieldReport };
};

module.exports = {
  removeSelected,
  extractFields,
  isOldVersion,
  processSegmentData,
  calculateStats,
  generateDetailedReport
};