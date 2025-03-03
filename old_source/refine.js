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

const generateUniqueFileName = (dir) => {
  let fileName;
  do {
    fileName = Math.random().toString(36).substring(2, 7);
  } while (fs.existsSync(path.join(dir, `${fileName}.json`)) || fs.existsSync(path.join(dir, `${fileName}.xlsx`)));
  return fileName;
};

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
    font: { bold: true },
    alignment: { vertical: 'middle', horizontal: 'center' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } },
  };

  worksheet.addRow(['Field', 'Value']).font = { bold: true };
  Object.entries(fields).forEach(([key, value]) => {
    const row = worksheet.addRow([key, value]);
    row.eachCell(cell => cell.style = headerStyle);
  });
  worksheet.addRow([]);
};

const addTableRows = (worksheet, table) => {
  const tableHeaderRow = worksheet.addRow([]);
  tableHeaderRow.eachCell((cell, colNumber) => {
    const headerCell = table.cells.find(cell => cell.rowIndex === 0 && cell.columnIndex === colNumber - 1);
    if (headerCell) {
      cell.value = headerCell.content;
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    }
  });

  table.cells.forEach(cell => {
    const { rowIndex, columnIndex, content } = cell;
    const row = worksheet.getRow(rowIndex + 10);
    row.getCell(columnIndex + 1).value = content;
    row.getCell(columnIndex + 1).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
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
    column.width = maxLength + 2;
  });
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
};

const compressImageIfNeeded = async (filePath) => {
  const stats = fs.statSync(filePath);
  if (stats.size > 4 * 1024 * 1024) {
    const compressedPath = `${filePath}-compressed`;
    await sharp(filePath).jpeg({ quality: 80 }).toFile(compressedPath);
    return compressedPath;
  }
  return filePath;
};

const processImage = async (filePath, returnJson = false) => {
  console.log(`Processing image: ${filePath}`);
  const compressedPath = await compressImageIfNeeded(filePath);
  const randomFileName = generateUniqueFileName(path.join(__dirname, 'output'));
  const jsonPath = path.join(__dirname, 'output', `${randomFileName}.json`);
  const excelPath = path.join(__dirname, 'output', `${randomFileName}.xlsx`);

  console.log('Creating readable stream for document analysis');
  const readableStream = fs.createReadStream(compressedPath);
  console.log('Beginning document analysis');
  const result = await (await client.beginAnalyzeDocument(modelId, readableStream)).pollUntilDone();
  console.log('Document analysis complete');

  console.log(`Writing JSON result to: ${jsonPath}`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  const fields = extractFields(result.documents[0]?.fields || {});
  const table = result.tables[0];

  if (!table) {
    console.error('No tables found in the document');
    throw new Error('No tables found in the document');
  }

  console.log('Creating Excel workbook');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Extracted Table');

  console.log('Adding field rows to worksheet');
  addFieldRows(worksheet, fields);

  console.log('Adding table rows to worksheet');
  addTableRows(worksheet, table);

  finalizeWorksheet(worksheet);

  console.log(`Writing Excel file to: ${excelPath}`);
  await workbook.xlsx.writeFile(excelPath);

  console.log('Excel file written successfully');
  const stats = fs.statSync(excelPath);
  console.log(`Excel file size: ${stats.size} bytes`);

  return { jsonPath, excelPath, randomFileName };
};

const handleUpload = async (req, res) => {
  console.log('Handling file upload');
  if (!req.file) {
    console.error('No file uploaded or file is not an image.');
    return res.status(400).send('No file uploaded or file is not an image.');
  }

  try {
    console.log(`Processing uploaded file: ${req.file.path}`);
    const { jsonPath, excelPath, randomFileName } = await processImage(req.file.path, req.headers['x-return-json'] === 'true');

    if (req.headers['x-return-json'] === 'true') {
      console.log('Preparing ZIP file with JSON and Excel');
      res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.zip`);
      res.setHeader('Content-Type', 'application/zip');

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);
      archive.file(jsonPath, { name: `${randomFileName}.json` });
      archive.file(excelPath, { name: `${randomFileName}.xlsx` });
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
    const { jsonPath, excelPath, randomFileName } = await processImage(tempFilePath, req.headers['x-return-json'] === 'true');

    if (req.headers['x-return-json'] === 'true') {
      console.log('Preparing ZIP file with JSON and Excel');
      res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.zip`);
      res.setHeader('Content-Type', 'application/zip');

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);
      archive.file(jsonPath, { name: `${randomFileName}.json` });
      archive.file(excelPath, { name: `${randomFileName}.xlsx` });
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

const purgeDirectories = (directories) => {
  directories.forEach(dir => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        console.error(`Error reading directory ${dir}: ${err.message}`);
        return;
      }
      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.unlink(filePath, err => {
          if (err) {
            console.error(`Error deleting file ${filePath}: ${err.message}`);
          } else {
            console.log(`Deleted file ${filePath}`);
          }
        });
      });
    });
  });
};

cron.schedule('0 0 * * *', () => {
  console.log('Running daily purge task');
  purgeDirectories(['uploads', 'output']);
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});