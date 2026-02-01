// Utility to call Gemini and get error fixes
const API_KEY = 'AIzaSyBN5DtRH_rxze7iarSZSr2l5L9_OO0kDtk';
const MODEL = 'models/gemini-1.5-flash';

/**
 * Generates a detailed prompt explaining the error and asking Gemini for a fix.
 * @param {string} errorMessage - Full console error text
 * @returns {Promise<string>} - Gemini's response text
 */
async function generateFixPrompt(errorMessage) {
  try {
    console.log('Creating prompt for Gemini...');
    const prompt = [
      'Eres un asistente técnico para desarrolladores web.',
      'Analiza el siguiente error y proporciona una solución concreta para resolverlo en el contexto de una aplicación web.',
      'Incluye pasos específicos y fragmentos de código si es necesario.',
      'Error de consola:',
      errorMessage
    ].join('\n');

    const url = `https://generativelanguage.googleapis.com/v1/${MODEL}:generateContent?key=${API_KEY}`;
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };

    console.log('Calling Gemini API...');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    console.log('Gemini response received.');
    return text;
  } catch (err) {
    console.error('Failed to generate fix prompt:', err);
    throw err;
  }
}

module.exports = { generateFixPrompt };
