/**
 * Render the home page with upload form
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const renderHomePage = (req, res) => {
    res.send(`
      <html>
        <head>
          <title>Document OCR Processing System</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 900px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f8f9fa;
            }
            h1 {
              color: #1a73e8;
              text-align: center;
              margin-bottom: 30px;
              font-weight: 500;
            }
            .container {
              display: flex;
              flex-direction: column;
              gap: 20px;
            }
            .card {
              background-color: #fff;
              padding: 25px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
              transition: transform 0.2s, box-shadow 0.2s;
            }
            .card:hover {
              transform: translateY(-5px);
              box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            }
            .card h2 {
              color: #1a73e8;
              margin-top: 0;
              font-weight: 500;
              margin-bottom: 20px;
              padding-bottom: 10px;
              border-bottom: 1px solid #eee;
            }
            form {
              display: flex;
              flex-direction: column;
              gap: 15px;
            }
            input[type="file"], input[type="url"] {
              display: block;
              width: 100%;
              padding: 12px;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 16px;
              transition: border-color 0.3s;
            }
            input[type="file"]:focus, input[type="url"]:focus {
              border-color: #1a73e8;
              outline: none;
            }
            .checkbox-group {
              display: flex;
              align-items: center;
              gap: 10px;
              margin: 5px 0;
            }
            input[type="checkbox"] {
              margin: 0;
              width: 18px;
              height: 18px;
            }
            label {
              font-size: 16px;
            }
            button {
              background-color: #1a73e8;
              color: #fff;
              padding: 12px 20px;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 16px;
              font-weight: 500;
              transition: background-color 0.3s ease;
            }
            button:hover {
              background-color: #1557b0;
            }
            #status {
              margin-top: 20px;
              padding: 15px;
              border-radius: 4px;
              display: none;
              font-weight: 500;
              text-align: center;
            }
            .success {
              background-color: #d4edda;
              color: #155724;
              border: 1px solid #c3e6cb;
            }
            .error {
              background-color: #f8d7da;
              color: #721c24;
              border: 1px solid #f5c6cb;
            }
            .loading {
              background-color: #e9ecef;
              color: #495057;
              border: 1px solid #ced4da;
            }
            .features {
              margin-top: 40px;
            }
            .features h3 {
              color: #1a73e8;
              margin-bottom: 10px;
            }
            .features ul {
              padding-left: 20px;
            }
            .features li {
              margin-bottom: 8px;
            }
            .spinner {
              display: inline-block;
              width: 20px;
              height: 20px;
              border: 3px solid rgba(0, 0, 0, 0.1);
              border-radius: 50%;
              border-top-color: #1a73e8;
              animation: spin 1s ease-in-out infinite;
              margin-right: 10px;
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            @media (max-width: 768px) {
              body {
                padding: 15px;
              }
              .card {
                padding: 15px;
              }
            }
          </style>
        </head>
        <body>
          <h1>Document OCR Processing System</h1>
          
          <div class="container">
            <div class="card">
              <h2>Upload Image</h2>
              <form id="uploadForm" enctype="multipart/form-data">
                <input type="file" name="file" accept="image/*" required>
                <div class="checkbox-group">
                  <input type="checkbox" id="json" name="json">
                  <label for="json">Return JSON data alongside Excel (useful for debugging)</label>
                </div>
                <button type="submit">Upload and Process</button>
              </form>
            </div>
  
            <div class="card">
              <h2>Process Image from URL</h2>
              <form id="urlForm">
                <input type="url" name="url" placeholder="Enter image URL" required>
                <div class="checkbox-group">
                  <input type="checkbox" id="jsonUrl" name="jsonUrl">
                  <label for="jsonUrl">Return JSON data alongside Excel (useful for debugging)</label>
                </div>
                <button type="submit">Process URL</button>
              </form>
            </div>
            
            <div id="status"></div>
  
            <div class="card features">
              <h2>System Features</h2>
              <h3>Image Processing</h3>
              <ul>
                <li>Enhanced preprocessing for poor quality images</li>
                <li>Automatic detection of document type</li>
                <li>Multiple preprocessing strategies for optimal OCR results</li>
              </ul>
              
              <h3>Data Extraction</h3>
              <ul>
                <li>Form field recognition</li>
                <li>Table structure analysis</li>
                <li>Automatic data validation and correction</li>
              </ul>
              
              <h3>Output Options</h3>
              <ul>
                <li>Formatted Excel reports</li>
                <li>Error highlighting for invalid data</li>
                <li>Optional JSON output for debugging</li>
                <li>Detailed CSV reports for validation issues</li>
              </ul>
            </div>
          </div>
  
          <script>
            function showStatus(message, type = 'loading') {
              const statusElement = document.getElementById('status');
              statusElement.innerHTML = type === 'loading' 
                ? '<div class="spinner"></div>' + message 
                : message;
              statusElement.className = type;
              statusElement.style.display = 'block';
              
              if (type === 'success') {
                setTimeout(() => {
                  statusElement.style.display = 'none';
                }, 5000);
              }
            }
  
            function handleResponse(xhr) {
              if (xhr.status === 200) {
                const blob = xhr.response;
                const link = document.createElement('a');
                const contentDisposition = xhr.getResponseHeader('Content-Disposition');
                let filename = 'download';
                
                if (contentDisposition) {
                  const filenameMatch = contentDisposition.match(/filename=([^;]+)/);
                  if (filenameMatch && filenameMatch[1]) {
                    filename = filenameMatch[1];
                  }
                }
                
                link.href = window.URL.createObjectURL(blob);
                link.download = filename;
                link.click();
                showStatus('Processing complete! Your file is downloading...', 'success');
              } else {
                let errorMessage = 'An error occurred while processing the file.';
                
                try {
                  const errorJson = JSON.parse(xhr.responseText);
                  if (errorJson.message) {
                    errorMessage = errorJson.message;
                  }
                } catch (e) {
                  // If parsing fails, use the default error message
                }
                
                showStatus(errorMessage, 'error');
              }
            }
  
            document.getElementById('uploadForm').onsubmit = function(event) {
              event.preventDefault();
              showStatus('Processing your image. This may take a minute...', 'loading');
              
              const formData = new FormData(this);
              const xhr = new XMLHttpRequest();
              xhr.open('POST', '/api/upload', true);
              
              if (document.getElementById('json').checked) {
                xhr.setRequestHeader('x-return-json', 'true');
              }
              
              xhr.responseType = 'blob';
              xhr.timeout = 300000; // 5 minute timeout
              
              xhr.onload = function() { handleResponse(xhr); };
              xhr.onerror = function() {
                showStatus('Network error while uploading the file.', 'error');
              };
              xhr.ontimeout = function() {
                showStatus('The request timed out. The image may be too complex or the server is busy.', 'error');
              };
              
              xhr.send(formData);
            };
  
            document.getElementById('urlForm').onsubmit = function(event) {
              event.preventDefault();
              showStatus('Processing image from URL. This may take a minute...', 'loading');
              
              const url = this.elements['url'].value;
              const xhr = new XMLHttpRequest();
              xhr.open('POST', '/api/process-url', true);
              xhr.setRequestHeader('Content-Type', 'application/json');
              
              if (document.getElementById('jsonUrl').checked) {
                xhr.setRequestHeader('x-return-json', 'true');
              }
              
              xhr.responseType = 'blob';
              xhr.timeout = 300000; // 5 minute timeout
              
              xhr.onload = function() { handleResponse(xhr); };
              xhr.onerror = function() {
                showStatus('Network error while processing the URL.', 'error');
              };
              xhr.ontimeout = function() {
                showStatus('The request timed out. The image may be too complex or the server is busy.', 'error');
              };
              
              xhr.send(JSON.stringify({ url: url }));
            };
          </script>
        </body>
      </html>
    `);
  };
  
  module.exports = {
    renderHomePage
  };