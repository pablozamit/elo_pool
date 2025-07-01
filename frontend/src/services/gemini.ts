export async function sendGeminiPrompt(prompt: string): Promise<string> {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Gemini API key not set');
    throw new Error('Missing Gemini API key');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
