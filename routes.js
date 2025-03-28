// Defines API routes and HTML serving
const express = require('express');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { processImage } = require('./processingService');
const { downloadImage } = require('./utils');
const multer = require('multer'); // Keep multer config simple here or move to middleware file

const router = express.Router();

// Simple Multer setup for routes
const upload = multer({
  dest: config.uploadDir,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// --- Route Handlers ---
const handleFileUploadRequest = async (req, res) => { // Combined handler
  console.log('Handling file upload request');
  if (!req.file) { return res.status(400).send('No file uploaded or file is not an image.'); }

  const originalFilePath = req.file.path;
  const returnJson = req.headers['x-return-json'] === 'true';

  try {
    const { jsonPath, excelPath, randomFileName, report } = await processImage(originalFilePath);

    // Send Response
    if (returnJson) {
        console.log('Preparing ZIP file response');
        res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.zip`);
        res.setHeader('Content-Type', 'application/zip');
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);
        archive.file(jsonPath, { name: `${randomFileName}.json` });
        archive.file(excelPath, { name: `${randomFileName}.xlsx` });
        if (report && report.segmentReport) archive.append(report.segmentReport, { name: `${randomFileName}_segment_report.csv` });
        if (report && report.fieldsReport) archive.append(report.fieldsReport, { name: `${randomFileName}_fields_report.csv` });
        await archive.finalize();
        console.log('ZIP file sent');
    } else {
        console.log('Sending Excel file response');
        res.setHeader('Content-Disposition', `attachment; filename=${randomFileName}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const readStream = fs.createReadStream(excelPath);
        readStream.pipe(res);
         // Optional: Clean up after sending
         readStream.on('close', () => {
            // fs.unlink(jsonPath, ()=>{}); // Keep output files unless explicitly told otherwise
            // fs.unlink(excelPath, ()=>{});
         });
    }
  } catch (error) {
    console.error("Error processing document:", error.message, error.stack);
    res.status(500).send(`An error occurred: ${error.message}`);
  } finally {
    if (fs.existsSync(originalFilePath)) {
      fs.unlinkSync(originalFilePath); // Clean up uploaded temp file
      console.log(`Deleted temporary upload file: ${originalFilePath}`);
    }
  }
};

const handleUrlRequest = async (req, res) => { //
  console.log('Handling URL processing request');
  const { url } = req.body;
  if (!url) { return res.status(400).send('No URL provided.'); }

  const tempFileName = `temp_${Date.now()}${path.extname(url) || '.jpg'}`;
  const tempFilePath = path.join(config.uploadDir, tempFileName);

  try {
    await downloadImage(url, tempFilePath);
    // Mock req object for handleFileUploadRequest
    await handleFileUploadRequest({
      file: { path: tempFilePath },
      headers: req.headers
    }, res);
  } catch (error) {
    console.error("Error processing document from URL:", error.message, error.stack);
    if (fs.existsSync(tempFilePath)) { fs.unlinkSync(tempFilePath); } // Clean up downloaded file on error
    res.status(500).send(`An error occurred processing the URL: ${error.message}`);
  }
  // handleFileUploadRequest's finally block will also try to delete, which is okay.
};

// --- Route Definitions ---
router.get('/', (req, res) => { // Serve HTML form
  res.send(`
    <html><head><title>Upload Image or URL</title>
        <style> body { font-family: sans-serif; max-width: 800px; margin: auto; padding: 20px; background-color:#f4f4f4; } h1 { text-align: center; } form { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; } input[type="file"], input[type="url"] { display: block; margin-bottom: 15px; width: calc(100% - 22px); padding: 10px; border: 1px solid #ddd; border-radius: 4px; } button { background-color: #3498db; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; } button:hover { background-color: #2980b9; } #status { margin-top: 20px; padding: 10px; border-radius: 4px; display: none; color: white; } .success { background-color: #2ecc71; } .error { background-color: #e74c3c; } </style>
    </head><body>
        <h1>Upload Image or URL for Table Extraction</h1>
        <form id="uploadForm" enctype="multipart/form-data"> <input type="file" name="file" accept="image/*"> <label><input type="checkbox" id="json"> Return JSON/Report too</label> <button type="submit">Upload and Process</button> </form>
        <form id="urlForm"> <input type="url" name="url" placeholder="Enter image URL" required> <label><input type="checkbox" id="jsonUrl"> Return JSON/Report too</label> <button type="submit">Process URL</button> </form>
        <div id="status"></div>
        <script> // --- Copy script block from refined.js --- </script>
    </body></html>
  `);
});

router.post('/upload', upload.single('file'), handleFileUploadRequest);
router.post('/api/upload', upload.single('file'), handleFileUploadRequest);
router.post('/api/process-url', express.json(), handleUrlRequest); // Ensure JSON body parsing is enabled before this route

module.exports = router;

// --- Add script block implementation ---
/*
          function showStatus(message, isError = false) {
            const statusElement = document.getElementById('status');
            statusElement.textContent = message; statusElement.className = isError ? 'error' : 'success'; statusElement.style.display = 'block';
          }
          function handleResponse(xhr) {
            if (xhr.status === 200) {
                const blob = xhr.response; const link = document.createElement('a'); link.href = window.URL.createObjectURL(blob);
                const disposition = xhr.getResponseHeader('Content-Disposition');
                let filename = "download"; // Default filename
                if (disposition && disposition.indexOf('attachment') !== -1) { var filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/; var matches = filenameRegex.exec(disposition); if (matches != null && matches[1]) { filename = matches[1].replace(/['"]/g, ''); } }
                link.download = filename; link.click(); window.URL.revokeObjectURL(link.href); // Clean up URL object
                showStatus('File processed successfully! Download started.');
            } else {
                // Try to read error message from blob response
                xhr.response.text().then(text => {
                   showStatus(`Error: ${xhr.status} ${xhr.statusText} - ${text}`, true);
                }).catch(() => {
                   showStatus(`Error: ${xhr.status} ${xhr.statusText}`, true);
                });
            }
          }
          document.getElementById('uploadForm').onsubmit = function(event) {
            event.preventDefault(); showStatus('Processing...'); const formData = new FormData(this); const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload', true); if (document.getElementById('json').checked) xhr.setRequestHeader('x-return-json', 'true');
            xhr.responseType = 'blob'; xhr.onload = function() { handleResponse(xhr); };
            xhr.onerror = function() { showStatus('Upload failed.', true); }; xhr.send(formData);
          };
           document.getElementById('urlForm').onsubmit = function(event) {
            event.preventDefault(); showStatus('Processing URL...'); const url = this.elements['url'].value; const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/process-url', true); xhr.setRequestHeader('Content-Type', 'application/json');
            if (document.getElementById('jsonUrl').checked) xhr.setRequestHeader('x-return-json', 'true');
            xhr.responseType = 'blob'; xhr.onload = function() { handleResponse(xhr); };
            xhr.onerror = function() { showStatus('Processing URL failed.', true); }; xhr.send(JSON.stringify({ url: url }));
          };
*/