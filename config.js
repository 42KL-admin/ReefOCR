require('dotenv').config();

// Configuration settings for the application
module.exports = {
  azureEndpoint: process.env.FORM_RECOGNIZER_ENDPOINT || "https://gamma.cognitiveservices.azure.com/",
  azureApiKey: process.env.FORM_RECOGNIZER_API_KEY || "e6b004bbb26842c19e833453f51efce1",
  azureModelId: process.env.FORM_RECOGNIZER_CUSTOM_MODEL_ID || "ReefReleasePreview",
  port: process.env.PORT || 8080,
  uploadDir: 'uploads/',
  outputDir: 'output/',
  validSubstrateCodes: { // Validation dictionary
      'HC': 'hard coral', 'NIA': 'nutrient indicator algae', 'RB': 'rubble',
      'OT': 'other', 'SC': 'soft coral', 'SP': 'sponge', 'SD': 'sand',
      'RKC': 'recently killed coral', 'RC': 'rock', 'SI': 'silt/clay'
  }
};