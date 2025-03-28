// Handles core logic: Azure interaction, image processing, Excel/report generation
const { AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const json2csv = require('json2csv').parse;
const config = require('./config');
const { removeSelected, generateUniqueFileName } = require('./utils'); // Import necessary utils

// --- Azure Client Initialization ---
const client = new DocumentAnalysisClient(
  config.azureEndpoint,
  new AzureKeyCredential(config.azureApiKey)
);

// --- Image Preprocessing ---
const preprocessImage = async (inputPath, outputPath) => {
  await sharp(inputPath)
    .grayscale().sharpen().normalise().gamma(1.5).toColourspace('b-w')
    .toFile(outputPath);
};

// --- Field Extraction ---
const extractFields = (fields) => ({
  location: fields?.Location?.value || 'N/A',
  islandCountry: fields?.["Island/Country"]?.value || 'N/A',
  date: fields?.Date?.value || 'N/A',
  teamLeader: fields?.["Team Leader"]?.value || 'N/A',
  timeOfDive: fields?.["Time of Dive"]?.value || 'N/A',
  divedDepth: fields?.["Dived Depth"]?.value || 'N/A',
  nameOfDiver: fields?.["Name Of Diver"]?.value || 'N/A',
});

// --- Excel Handling Functions ---
const addFieldRows = (worksheet, fields) => { /* ... Copy function ... */ };
const processSegmentData = (table) => { /* ... Copy function, use config.validSubstrateCodes ... */ };
const addSegmentTable = (worksheet, segmentData) => { /* ... Copy function ... */ };
const finalizeWorksheet = (worksheet) => { /* ... Copy function ... */ };
// const addSpeciesTable = (worksheet, table) => { /* ... Implement if needed ... */ };

// --- Report Generation ---
const generateDetailedReport = (segmentData, fields) => { /* ... Copy function ... */ };
const calculateStats = (segmentData) => { /* ... Copy function ... */ };

// --- Main Processing Function ---
const processImage = async (filePath) => {
  console.log(`Processing image: ${filePath}`);
  const preprocessedPath = path.join(config.uploadDir, `${path.basename(filePath)}-preprocessed.tiff`);
  await preprocessImage(filePath, preprocessedPath);

  const randomFileName = generateUniqueFileName(config.outputDir);
  const jsonPath = path.join(config.outputDir, `${randomFileName}.json`);
  const excelPath = path.join(config.outputDir, `${randomFileName}.xlsx`);

  let result, fields, tables, report = null;

  try {
    console.log('Creating readable stream for document analysis');
    const readableStream = fs.createReadStream(preprocessedPath);
    console.log('Beginning document analysis with model:', config.azureModelId);
    const poller = await client.beginAnalyzeDocument(config.azureModelId, readableStream);
    result = await poller.pollUntilDone();
    console.log('Document analysis complete');

    console.log(`Writing JSON result to: ${jsonPath}`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

    fields = extractFields(result.documents[0]?.fields || {});
    tables = result.tables;

    if (!tables || tables.length === 0) {
      console.error('No tables found in the document');
      throw new Error('No tables found in the document');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Extracted Data');
    addFieldRows(worksheet, fields);

    let isOldVersion = Object.values(fields).filter(v => v !== 'N/A').length > 2;
    console.log('Form version detected as:', isOldVersion ? 'Old' : 'New');

    if (isOldVersion) {
      const segmentData = processSegmentData(tables[0]);
      addSegmentTable(worksheet, segmentData);
      report = generateDetailedReport(segmentData, fields);
      // Add legend and stats
      worksheet.addRow([]);
      worksheet.addRow(['Substrate Code Legend:']).font = { bold: true };
      Object.entries(config.validSubstrateCodes).forEach(([code, desc]) => worksheet.addRow([code, desc]));
      worksheet.addRow([]);
      const stats = calculateStats(segmentData);
      worksheet.addRow(['Statistics:']).font = { bold: true };
       Object.entries(stats).forEach(([key, value]) => worksheet.addRow([`${key}:`, value]));
    } else {
       console.log('Processing species data (assuming new version).');
       tables.forEach((table, index) => {
          worksheet.addRow([`Table ${index + 1}`]).font = { bold: true, size: 14 };
          // Replace with actual addSpeciesTable or use placeholder:
           if (table && table.cells) {
                const headerRow = table.cells.filter(c => c.rowIndex === 0).sort((a, b) => a.columnIndex - b.columnIndex);
                worksheet.addRow(headerRow.map(c => removeSelected(c.content)));
                worksheet.lastRow.font = { bold: true };
                for (let r = 1; r < table.rowCount; r++) {
                    const rowCells = table.cells.filter(c => c.rowIndex === r).sort((a, b) => a.columnIndex - b.columnIndex);
                    worksheet.addRow(rowCells.map(c => removeSelected(c.content)));
                }
           }
           worksheet.addRow([]);
       });
    }

    finalizeWorksheet(worksheet);
    await workbook.xlsx.writeFile(excelPath);
    console.log(`Excel file written successfully: ${excelPath}`);

  } catch (error) {
      console.error("Error during Azure analysis or Excel creation:", error);
      throw error; // Re-throw error to be caught by route handler
  }
  finally {
    if (fs.existsSync(preprocessedPath)) {
      fs.unlinkSync(preprocessedPath);
      console.log(`Deleted preprocessed file: ${preprocessedPath}`);
    }
  }

  return { jsonPath, excelPath, randomFileName, report };
};


module.exports = { processImage };

// --- Copy Helper function implementations here ---
// addFieldRows, processSegmentData, addSegmentTable, finalizeWorksheet,
// generateDetailedReport, calculateStats
// Ensure they use `config` and `removeSelected` where needed.
const validSubstrateCodes = config.validSubstrateCodes; // Make available inside functions

function addFieldRows (worksheet, fields) { //
  const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } }, alignment: { vertical: 'middle', horizontal: 'center' }, };
  const dataStyle = { font: { color: { argb: 'FF000000' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3DFEE' } }, alignment: { vertical: 'middle', horizontal: 'left' }, };
  worksheet.addRow(['Field', 'Value']); worksheet.lastRow.eachCell(cell => { cell.style = headerStyle; });
  Object.entries(fields).forEach(([key, value]) => { const row = worksheet.addRow([key, removeSelected(value)]); row.eachCell((cell, colNumber) => { cell.style = dataStyle; if (colNumber === 1) { cell.font = { bold: true }; } }); });
  worksheet.addRow([]);
}

function processSegmentData (table) { //
    const segmentData = { 1: { range: '0 - 19.5 m', data: [] }, 2: { range: '25 - 44.5 m', data: [] }, 3: { range: '50 - 69.5 m', data: [] }, 4: { range: '75 - 94.5 m', data: [] } };
    const lastValidContent = {};
    if (!table || !table.cells) { console.error('Invalid table structure'); return segmentData; }
    table.cells.forEach(cell => {
        if (!cell || typeof cell.rowIndex === 'undefined' || typeof cell.columnIndex === 'undefined') { console.error('Invalid cell structure:', cell); return; }
        const { rowIndex, columnIndex, content } = cell; if (rowIndex === 0) return;
        const segment = Math.floor(columnIndex / 2) + 1; if (segment < 1 || segment > 4) { console.error(`Invalid segment number: ${segment}`); return; }
        const isDepth = columnIndex % 2 === 0; if (!lastValidContent[segment]) { lastValidContent[segment] = null; }
        let processedContent = removeSelected((content || '').trim()); let isBlank = processedContent === ''; let filledFromAbove = false;
        if (!isDepth) {
            if (isBlank && lastValidContent[segment]) { processedContent = lastValidContent[segment]; filledFromAbove = true; }
            const isValid = validSubstrateCodes.hasOwnProperty(processedContent.toUpperCase());
            if (isValid && !isBlank) { lastValidContent[segment] = processedContent; }
            const depth = removeSelected(table.cells.find(c => c.rowIndex === rowIndex && c.columnIndex === (columnIndex - 1))?.content || '');
            segmentData[segment].data.push({ depth, content: processedContent, isValid, isBlank, filledFromAbove });
        }
    }); return segmentData;
}

function addSegmentTable (worksheet, segmentData) { //
    const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } }, alignment: { vertical: 'middle', horizontal: 'center' }, border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }, }, };
    const dataStyle = { alignment: { vertical: 'middle', horizontal: 'center' }, border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }, }, };
    const invalidDataStyle = { ...dataStyle, font: { color: { argb: 'FFFF0000' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD9D9' } }, };
    const filledFromAboveStyle = { ...dataStyle, font: { color: { argb: 'FF0000FF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FF' } }, };
    const headers = ['Segment 1 (Depth)', 'Segment 1 (Code)', 'Segment 2 (Depth)', 'Segment 2 (Code)', 'Segment 3 (Depth)', 'Segment 3 (Code)', 'Segment 4 (Depth)', 'Segment 4 (Code)'];
    const headerRow = worksheet.addRow(headers); headerRow.eachCell(cell => { cell.style = headerStyle; });
    const rangeRow = worksheet.addRow(Object.values(segmentData).flatMap(s => [s.range, ''])); rangeRow.eachCell((cell, colNumber) => { if(colNumber % 2 !== 0) cell.style = { ...dataStyle, font: { bold: true } }; else cell.style = dataStyle; }); // Style only range cells
    const maxRows = Math.max(...Object.values(segmentData).map(s => s.data.length));
    for (let i = 0; i < maxRows; i++) {
        const rowData = []; const rowStyles = [];
        Object.values(segmentData).forEach(segment => {
            const cellData = segment.data[i] || {}; rowData.push(cellData.depth || '', cellData.content || '');
            rowStyles.push(dataStyle); // Style for depth cell
            if (cellData.filledFromAbove) { rowStyles.push(filledFromAboveStyle); } else if (!cellData.isValid) { rowStyles.push(invalidDataStyle); } else { rowStyles.push(dataStyle); } // Style for code cell
        });
        const dataRow = worksheet.addRow(rowData); dataRow.eachCell((cell, colNumber) => { cell.style = rowStyles[colNumber - 1]; });
    }
    // Merge range cells
    worksheet.mergeCells(rangeRow.getCell(1).address, rangeRow.getCell(2).address);
    worksheet.mergeCells(rangeRow.getCell(3).address, rangeRow.getCell(4).address);
    worksheet.mergeCells(rangeRow.getCell(5).address, rangeRow.getCell(6).address);
    worksheet.mergeCells(rangeRow.getCell(7).address, rangeRow.getCell(8).address);

    // Merge header cells for segments
     worksheet.mergeCells(headerRow.getCell(1).address, headerRow.getCell(2).address); headerRow.getCell(1).value = 'Segment 1';
     worksheet.mergeCells(headerRow.getCell(3).address, headerRow.getCell(4).address); headerRow.getCell(3).value = 'Segment 2';
     worksheet.mergeCells(headerRow.getCell(5).address, headerRow.getCell(6).address); headerRow.getCell(5).value = 'Segment 3';
     worksheet.mergeCells(headerRow.getCell(7).address, headerRow.getCell(8).address); headerRow.getCell(7).value = 'Segment 4';

    // Legend for invalid/filled data
    worksheet.addRow([]);
    const invalidLegendRow = worksheet.addRow(['Invalid data is highlighted in red']); invalidLegendRow.getCell(1).font = { italic: true, color: { argb: 'FFFF0000' } };
    const filledLegendRow = worksheet.addRow(['Blank cells filled from above are highlighted in blue']); filledLegendRow.getCell(1).font = { italic: true, color: { argb: 'FF0000FF' } };
}

function finalizeWorksheet (worksheet) { //
    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => { const columnLength = cell.value ? cell.value.toString().length : 10; if (columnLength > maxLength) { maxLength = columnLength; } });
        column.width = Math.min(maxLength + 2, 20); // Adjusted max width
    });
    worksheet.views = [ { state: 'frozen', xSplit: 0, ySplit: 2, topLeftCell: 'A3', activeCell: 'A3' } ]; // Freeze header and range rows
}

function generateDetailedReport (segmentData, fields) { //
    const reportData = [];
    Object.entries(segmentData).forEach(([segment, data]) => {
        data.data.forEach((cell, index) => {
            if (!cell.isValid || cell.filledFromAbove) {
                reportData.push({ segment: segment, depth: removeSelected(cell.depth), originalContent: cell.isBlank ? '' : removeSelected(cell.content), processedContent: removeSelected(cell.content), isValid: cell.isValid ? 'Yes' : 'No', filledFromAbove: cell.filledFromAbove ? 'Yes' : 'No', issue: cell.isValid ? (cell.filledFromAbove ? 'Filled from above' : '') : 'Invalid substrate code' });
            }
        });
    });
    const fieldReportData = Object.entries(fields).map(([key, value]) => ({ field: key, value: removeSelected(value), issue: value === 'N/A' ? 'Missing or unrecognized' : '' }));
    const segmentReport = reportData.length > 0 ? json2csv(reportData, { header: true }) : "No segment issues found.";
    const fieldsReport = fieldReportData.length > 0 ? json2csv(fieldReportData, { header: true }) : "No field issues found.";
    return { segmentReport, fieldsReport };
}

function calculateStats (segmentData) { //
    let totalCells = 0, validCells = 0, invalidCells = 0, filledCells = 0;
    Object.values(segmentData).forEach(segment => {
        segment.data.forEach(cell => {
            if (!cell.isDepth) { // Count only substrate code cells
                totalCells++;
                if (cell.isValid) validCells++;
                if (!cell.isValid && !cell.isBlank && !cell.filledFromAbove) invalidCells++; // Count only originally invalid, not blank
                if (cell.filledFromAbove) filledCells++;
            }
        });
    }); return { 'Total Substrate Cells': totalCells, 'Valid Cells': validCells, 'Invalid Cells': invalidCells, 'Blank Cells Filled': filledCells };
}