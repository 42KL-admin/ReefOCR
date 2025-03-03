const express = require('express');
const multer = require('multer');
const { AzureKeyCredential, DocumentAnalysisClient } = require("@azure/ai-form-recognizer");
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const archiver = require('archiver');
const cron = require('node-cron');
const axios = require('axios');
const cors = require('cors');
const json2csv = require('json2csv').parse;
require('dotenv').config();

const app = express();
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      console.error('File is not an image');
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

const client = new DocumentAnalysisClient(
  process.env.FORM_RECOGNIZER_ENDPOINT || "https://gamma.cognitiveservices.azure.com/",
  new AzureKeyCredential(process.env.FORM_RECOGNIZER_API_KEY || "e6b004bbb26842c19e833453f51efce1")
);
const modelId = process.env.FORM_RECOGNIZER_CUSTOM_MODEL_ID || "ReefReleasePreview";

app.use(express.static('public'));
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-return-json']
}));

const validSubstrateCodes = {
  'HC': 'hard coral',
  'NIA': 'nutrient indicator algae',
  'RB': 'rubble',
  'OT': 'other',
  'SC': 'soft coral',
  'SP': 'sponge',
  'SD': 'sand',
  'RKC': 'recently killed coral',
  'RC': 'rock',
  'SI': 'silt/clay'
};

const generateUniqueFileName = (dir) => {
  let fileName;
  do {
    fileName = Math.random().toString(36).substring(2, 7);
  } while (fs.existsSync(path.join(dir, `${fileName}.json`)) || fs.existsSync(path.join(dir, `${fileName}.xlsx`)));
  return fileName;
};


const removeSelected = (value) => {
    if (typeof value === 'string') {
      return value.replace(/:selected:/g, '').trim();
    }
    return value;
};
  
  // Modify the extractFields function to use removeSelected
  const extractFields = (fields) => ({
    location: fields.Location?.value || 'N/A',
    islandCountry: fields["Island/Country"]?.value || 'N/A',
    date: fields.Date?.value || 'N/A',
    teamLeader: fields["Team Leader"]?.value || 'N/A',
    timeOfDive: fields["Time of Dive"]?.value || 'N/A',
    divedDepth: fields["Dived Depth"]?.value || 'N/A',
    nameOfDiver: fields["Name Of Diver"]?.value || 'N/A',
  });


const addFieldRows = (worksheet, fields) => {
  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
  };
  const dataStyle = {
    font: { color: { argb: 'FF000000' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3DFEE' } },
    alignment: { vertical: 'middle', horizontal: 'left' },
  };

  worksheet.addRow(['Field', 'Value']);
  worksheet.lastRow.eachCell(cell => { cell.style = headerStyle; });

  Object.entries(fields).forEach(([key, value]) => {
    const row = worksheet.addRow([key, value]);
    row.eachCell((cell, colNumber) => {
      cell.style = dataStyle;
      if (colNumber === 1) {
        cell.font = { bold: true };
      }
    });
  });

  worksheet.addRow([]);  // Add an empty row for spacing
};

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
  
        const isValid = validSubstrateCodes.hasOwnProperty(processedContent.toUpperCase());
        
        if (isValid && !isBlank) {
          lastValidContent[segment] = processedContent;
        }
  
        const depth = removeSelected(table.cells.find(c => c.rowIndex === rowIndex && c.columnIndex === (columnIndex - 1))?.content || '');
        
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

const addSegmentTable = (worksheet, segmentData) => {
  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    },
  };
  const dataStyle = {
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    },
  };
  const invalidDataStyle = {
    ...dataStyle,
    font: { color: { argb: 'FFFF0000' } },  // Red text for invalid data
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD9D9' } },  // Light red background
  };
  const filledFromAboveStyle = {
    ...dataStyle,
    font: { color: { argb: 'FF0000FF' } },  // Blue text for filled from above
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FF' } },  // Light blue background
  };

  // Add header row
  const headers = ['Segment 1', 'Segment 2', 'Segment 3', 'Segment 4'];
  const headerRow = worksheet.addRow(headers);
  headerRow.eachCell(cell => { cell.style = headerStyle; });

  // Add range row
  const rangeRow = worksheet.addRow(Object.values(segmentData).map(s => s.range));
  rangeRow.eachCell(cell => { 
    cell.style = {...dataStyle, font: { bold: true } };
  });

  // Add data rows
  const maxRows = Math.max(...Object.values(segmentData).map(s => s.data.length));
  for (let i = 0; i < maxRows; i++) {
    const rowData = [];
    const rowStyles = [];
    Object.values(segmentData).forEach(segment => {
      const cellData = segment.data[i] || {};
      rowData.push(cellData.depth || '', cellData.content || '');
      rowStyles.push(dataStyle);
      if (cellData.filledFromAbove) {
        rowStyles.push(filledFromAboveStyle);
      } else if (!cellData.isValid) {
        rowStyles.push(invalidDataStyle);
      } else {
        rowStyles.push(dataStyle);
      }
    });
    const dataRow = worksheet.addRow(rowData);
    dataRow.eachCell((cell, colNumber) => { 
      cell.style = rowStyles[colNumber - 1];  // Apply the appropriate style
    });
  }

  // Add a legend for invalid and filled data
  worksheet.addRow([]);
  const invalidLegendRow = worksheet.addRow(['Invalid data is highlighted in red']);
  invalidLegendRow.getCell(1).font = { italic: true, color: { argb: 'FFFF0000' } };
  const filledLegendRow = worksheet.addRow(['Blank cells filled from above are highlighted in blue']);
  filledLegendRow.getCell(1).font = { italic: true, color: { argb: 'FF0000FF' } };
};

const finalizeWorksheet = (worksheet) => {
  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, cell => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = Math.min(maxLength + 2, 30);  // Cap column width at 30
  });
  worksheet.views = [
    { state: 'frozen', xSplit: 1, ySplit: 1, topLeftCell: 'B2', activeCell: 'B2' }
  ];
};

const preprocessImage = async (inputPath, outputPath) => {
  await sharp(inputPath)
    .grayscale()
    .sharpen()
    .normalise()
    .gamma(1.5)
    .toColourspace('b-w')
    .toFile(outputPath);
};

const generateDetailedReport = (segmentData, fields) => {
    const reportData = [];
    
    Object.entries(segmentData).forEach(([segment, data]) => {
      data.data.forEach((cell, index) => {
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
  
    const segmentReport = json2csv(reportData, { header: true });
    const fieldsReport = json2csv(fieldReport, { header: true });
  
    return {
      segmentReport,
      fieldsReport
    };
};

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

const processImage = async (filePath, returnJson = false) => {
  console.log(`Processing image: ${filePath}`);
  const preprocessedPath = `${filePath}-preprocessed.tiff`;
  await preprocessImage(filePath, preprocessedPath);
  
  const randomFileName = generateUniqueFileName(path.join(__dirname, 'output'));
  const jsonPath = path.join(__dirname, 'output', `${randomFileName}.json`);
  const excelPath = path.join(__dirname, 'output', `${randomFileName}.xlsx`);

  console.log('Creating readable stream for document analysis');
  const readableStream = fs.createReadStream(preprocessedPath);
  console.log('Beginning document analysis');
  const result = await (await client.beginAnalyzeDocument(modelId, readableStream)).pollUntilDone();
  console.log('Document analysis complete');

  console.log(`Writing JSON result to: ${jsonPath}`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  const fields = extractFields(result.documents[0]?.fields || {});
  const tables = result.tables;

  if (!tables || tables.length === 0) {
    console.error('No tables found in the document');
    throw new Error('No tables found in the document');
  }

  console.log('Creating Excel workbook');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Extracted Data');

  console.log('Adding field rows to worksheet');
  addFieldRows(worksheet, fields);

  let report = null;

  console.log('Processing table data');

  let isOldVersion = Object.values(extractFields(fields)).some(value => value !== 'N/A');

   console.log('isOldVersion', isOldVersion);

  if (isOldVersion === true) {
    console.log('Detected old version of the document. Processing segment data.');
    const segmentData = processSegmentData(tables[0]);
    addSegmentTable(worksheet, segmentData);
    
    // Generate detailed report
    report = generateDetailedReport(segmentData, fields);

    // Add substrate code legend
    worksheet.addRow([]);
    worksheet.addRow(['Substrate Code Legend:']);
    Object.entries(validSubstrateCodes).forEach(([code, description]) => {
      worksheet.addRow([code, description]);
    });

    // Add statistics
    worksheet.addRow([]);
    const stats = calculateStats(segmentData);
    worksheet.addRow(['Statistics:']);
    worksheet.addRow(['Total cells:', stats.totalCells]);
    worksheet.addRow(['Valid cells:', stats.validCells]);
    worksheet.addRow(['Invalid cells:', stats.invalidCells]);
    worksheet.addRow(['Blank cells filled:', stats.filledCells]);
  } else {
    console.log('Detected new version of the document. Processing species data.');
    tables.forEach((table, index) => {
      worksheet.addRow([`Table ${index + 1}`]).font = { bold: true, size: 14 };
      addSpeciesTable(worksheet, table);
      worksheet.addRow([]);  // Add an empty row for spacing

    });
  }

  finalizeWorksheet(worksheet);

  console.log(`Writing Excel file to: ${excelPath}`);
  await workbook.xlsx.writeFile(excelPath);

  console.log('Excel file written successfully');
  const stats = fs.statSync(excelPath);
  console.log(`Excel file size: ${stats.size} bytes`);

  // Clean up the preprocessed file
  fs.unlinkSync(preprocessedPath);

  return { jsonPath, excelPath, randomFileName, report };
};

const handleUpload = async (req, res) => {
  console.log('Handling file upload');
  if (!req.file) {
    console.error('No file uploaded or file is not an image.');
    return res.status(400).send('No file uploaded or file is not an image.');
  }

  try {
    console.log(`Processing uploaded file: ${req.file.path}`);
    const { jsonPath, excelPath, randomFileName, report } = await processImage(req.file.path, req.headers['x-return-json'] === 'true');

    if (req.headers['x-return-json'] === 'true') {
      console.log('Preparing ZIP file with JSON, Excel, and Report');
      res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.zip`);
      res.setHeader('Content-Type', 'application/zip');

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);
      archive.file(jsonPath, { name: `${randomFileName}.json` });
      archive.file(excelPath, { name: `${randomFileName}.xlsx` });
      
      if (report) {
        archive.append(report.segmentReport, { name: `${randomFileName}_segment_report.csv` });
        archive.append(report.fieldsReport, { name: `${randomFileName}_fields_report.csv` });
      }
      
      await archive.finalize();
      console.log('ZIP file sent to client');
    } else {
      console.log('Sending Excel file to client');
      res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      fs.createReadStream(excelPath).pipe(res);
    }
  } catch (error) {
    console.error("Error processing document:", error);
    res.status(500).send("An error occurred while processing the document.");
  } finally {
    console.log(`Deleting temporary file: ${req.file.path}`);
    fs.unlinkSync(req.file.path);
  }
};

const downloadImage = async (url, filePath) => {
  console.log(`Downloading image from URL: ${url}`);
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream'
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
};

const handleAzureBlobUrl = async (req, res) => {
  console.log('Handling Azure Blob URL request');
  const { url } = req.body;
  if (!url) {
    console.error('No URL provided.');
    return res.status(400).send('No URL provided.');
  }

  const tempFilePath = path.join(__dirname, 'uploads', `temp_${Date.now()}.jpg`);

  try {
    await downloadImage(url, tempFilePath);
    console.log(`Processing downloaded image: ${tempFilePath}`);
    const { jsonPath, excelPath, randomFileName, report } = await processImage(tempFilePath, req.headers['x-return-json'] === 'true');

    if (req.headers['x-return-json'] === 'true') {
      console.log('Preparing ZIP file with JSON, Excel, and Report');
      res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.zip`);
      res.setHeader('Content-Type', 'application/zip');

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);
      archive.file(jsonPath, { name: `${randomFileName}.json` });
      archive.file(excelPath, { name: `${randomFileName}.xlsx` });
      
      if (report) {
        archive.append(report.segmentReport, { name: `${randomFileName}_segment_report.csv` });
        archive.append(report.fieldsReport, { name: `${randomFileName}_fields_report.csv` });
      }
      
      await archive.finalize();
      console.log('ZIP file sent to client');
    } else {
      console.log('Sending Excel file to client');
      res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      fs.createReadStream(excelPath).pipe(res);
    }
  } catch (error) {
    console.error("Error processing document:", error);
    res.status(500).send("An error occurred while processing the document.");
  } finally {
    console.log(`Deleting temporary file: ${tempFilePath}`);
    fs.unlinkSync(tempFilePath);
  }
};

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Upload Image or URL for Table Extraction</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 30px;
          }
          form {
            background-color: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
          }
          input[type="file"], input[type="url"] {
            display: block;
            margin-bottom: 20px;
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
          }
          input[type="checkbox"] {
            margin-right: 10px;
          }
          label {
            display: inline-block;
            margin-bottom: 10px;
          }
          button {
            background-color: #3498db;
            color: #fff;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            transition: background-color 0.3s ease;
          }
          button:hover {
            background-color: #2980b9;
          }
          #status {
            margin-top: 20px;
            padding: 10px;
            border-radius: 4px;
            display: none;
          }
          .success {
            background-color: #2ecc71;
            color: #fff;
          }
          .error {
            background-color: #e74c3c;
            color: #fff;
          }
        </style>
      </head>
      <body>
        <h1>Upload Image or URL for Table Extraction</h1>
        <form id="uploadForm" enctype="multipart/form-data">
          <input type="file" name="file" accept="image/*">
          <label for="json">
            <input type="checkbox" id="json" name="json">
            Return JSON as well
          </label>
          <button type="submit">Upload and Process</button>
        </form>
        <form id="urlForm">
          <input type="url" name="url" placeholder="Enter image URL" required>
          <label for="jsonUrl">
            <input type="checkbox" id="jsonUrl" name="jsonUrl">
            Return JSON as well
          </label>
          <button type="submit">Process URL</button>
        </form>
        <div id="status"></div>
        <script>
          function showStatus(message, isError = false) {
            const statusElement = document.getElementById('status');
            statusElement.textContent = message;
            statusElement.className = isError ? 'error' : 'success';
            statusElement.style.display = 'block';
          }

          function handleResponse(xhr) {
            if (xhr.status === 200) {
              const blob = xhr.response;
              const link = document.createElement('a');
              link.href = window.URL.createObjectURL(blob);
              link.download = xhr.getResponseHeader('Content-Disposition').split('filename=')[1];
              link.click();
              showStatus('File processed successfully!');
            } else {
              showStatus('An error occurred while processing the file.', true);
            }
          }

          document.getElementById('uploadForm').onsubmit = function(event) {
            event.preventDefault();
            const formData = new FormData(this);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true);
            if (document.getElementById('json').checked) {
              xhr.setRequestHeader('x-return-json', 'true');
            }
            xhr.responseType = 'blob';
            xhr.onload = function() { handleResponse(xhr); };
            xhr.onerror = function() {
              showStatus('An error occurred while uploading the file.', true);
            };
            xhr.send(formData);
            showStatus('Processing...');
          };

          document.getElementById('urlForm').onsubmit = function(event) {
            event.preventDefault();
            const url = this.elements['url'].value;
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/process-url', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (document.getElementById('jsonUrl').checked) {
              xhr.setRequestHeader('x-return-json', 'true');
            }
            xhr.responseType = 'blob';
            xhr.onload = function() { handleResponse(xhr); };
            xhr.onerror = function() {
              showStatus('An error occurred while processing the URL.', true);
            };
            xhr.send(JSON.stringify({ url: url }));
            showStatus('Processing...');
          };
        </script>
      </body>
    </html>
  `);
});

app.post('/upload', upload.single('file'), handleUpload);
app.post('/api/upload', upload.single('file'), handleUpload);
app.post('/api/process-url', handleAzureBlobUrl);


cron.schedule('0 0 * * *', () => {
  console.log('Running daily purge task');
  purgeDirectories(['uploads', 'output']);
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

            