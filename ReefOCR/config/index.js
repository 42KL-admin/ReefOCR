require('dotenv').config();

module.exports = {
  port: process.env.PORT || 8080,
  azure: {
    formRecognizerEndpoint: process.env.FORM_RECOGNIZER_ENDPOINT || "https://gamma.cognitiveservices.azure.com/",
    formRecognizerApiKey: process.env.FORM_RECOGNIZER_API_KEY || "e6b004bbb26842c19e833453f51efce1",
    modelId: process.env.FORM_RECOGNIZER_CUSTOM_MODEL_ID || "ReefReleasePreview",
  },
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-return-json']
  },
  upload: {
    dest: '../uploads/',
  },
  output: {
    dir: '../output/'
  },
  validSubstrateCodes: {
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
  }
};