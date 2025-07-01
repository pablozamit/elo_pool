export async function sendGeminiPrompt(prompt: string): Promise<string> {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Gemini API key not set');
    throw new Error('Missing Gemini API key');
  }

  const url = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      if (res.status === 404) {
        console.error('[Gemini] Error 404');
        console.error('[Gemini] No se pudo generar sugerencia automática');
        return '[Gemini] No se pudo generar sugerencia automática';
      }
      console.error('Gemini API error', res.status, res.statusText);
      const errText = await res.text().catch(() => '');
      throw new Error(errText || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    const textResponse =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return textResponse;
  } catch (err) {
    console.error('Failed to fetch from Gemini', err);
    throw err;
  }
}
