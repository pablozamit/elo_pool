export async function analyzeErrorWithGemini(error: any): Promise<string> {
  console.log('[Gemini] Received error object', error);
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[Gemini] API key missing');
    throw new Error('Missing Gemini API key');
  }

  const prompt = `Analiza el siguiente error y sugiere una posible causa y solucion breve:\n\n` +
    `Mensaje: ${error?.message ?? ''}\n` +
    `Nombre: ${error?.name ?? ''}\n` +
    `Stack: ${error?.stack ?? ''}`;
  console.log('[Gemini] Built prompt', prompt);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
  console.log('[Gemini] Sending request to', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });
  console.log('[Gemini] Response status', res.status);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[Gemini] API error', res.status, errText);
    throw new Error(errText || `HTTP error ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  console.log('[Gemini] Parsed response', data);
  const suggestion = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!suggestion) {
    console.error('[Gemini] No suggestion returned');
    throw new Error('No se pudo generar la sugerencia con Gemini');
  }
  console.log('[Gemini] Suggestion ready');
  return suggestion;
}
