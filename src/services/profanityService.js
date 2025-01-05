// src/services/profanityService.js
const fetch = require('node-fetch');

module.exports = {
  async checkAndCleanText(text) {
    try {
      const response = await fetch(
        `https://www.purgomalum.com/service/json?text=${encodeURIComponent(text)}`
      );
      const data = await response.json();
      const isClean = (data.result.trim() === text.trim());
      return {
        isClean,
        cleanedText: data.result
      };
    } catch (err) {
      console.error('Profanity check failed:', err);
      // fallback: assume clean
      return { isClean: true, cleanedText: text };
    }
  }
};
