// Generic utility functions
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const generateUniqueFileName = (dir) => { //
  let fileName;
  do {
    fileName = Math.random().toString(36).substring(2, 7);
  } while (fs.existsSync(path.join(dir, `${fileName}.json`)) || fs.existsSync(path.join(dir, `${fileName}.xlsx`)));
  return fileName;
};

const removeSelected = (value) => { //
  return (typeof value === 'string') ? value.replace(/:selected:/g, '').trim() : value;
};

const downloadImage = async (url, filePath) => { //
    console.log(`Downloading image from URL: ${url}`);
    const response = await axios({ method: 'GET', url: url, responseType: 'stream' });
    return new Promise((resolve, reject) => { /* ... Copy promise logic ... */ });
};

const purgeDirectories = (directories) => { //
   directories.forEach(dir => {
    if (!fs.existsSync(dir)) { console.log(`Directory ${dir} not found, skipping purge.`); return; }
    fs.readdir(dir, (err, files) => { /* ... Copy readdir logic ... */ });
   });
};

module.exports = {
  generateUniqueFileName,
  removeSelected,
  downloadImage,
  purgeDirectories
};

// --- Implementation for downloadImage promise logic ---
function downloadImage (url, filePath) { //
  console.log(`Downloading image from URL: ${url}`);
  return new Promise((resolve, reject) => {
     axios({ method: 'GET', url: url, responseType: 'stream' })
     .then(response => {
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        writer.on('finish', () => { console.log(`Image downloaded and saved to: ${filePath}`); resolve(); });
        writer.on('error', (error) => { console.error(`Error writing downloaded image: ${error.message}`); fs.unlink(filePath, () => {}); reject(error); }); // Clean up partial file on error
     })
     .catch(error => { console.error(`Error downloading image: ${error.message}`); reject(error); });
  });
}

// --- Implementation for purgeDirectories readdir logic ---
function purgeDirectories (directories) { //
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) { console.log(`Directory ${dir} not found, skipping purge.`); return; }
    fs.readdir(dir, (err, files) => {
      if (err) { console.error(`Error reading directory ${dir}: ${err.message}`); return; }
      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.unlink(filePath, err => {
          if (err) { console.error(`Error deleting file ${filePath}: ${err.message}`); }
          else { console.log(`Deleted file ${filePath}`); }
        });
      });
    });
  });
}