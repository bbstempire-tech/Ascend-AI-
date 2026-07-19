// api/generate.js
// Backend de Ascend AI: recibe peticiones del frontend y las reenvía a la API
// gratuita de NVIDIA (NIM), usando la clave guardada como variable de entorno
// en Vercel (NVIDIA_API_KEY). La clave nunca se expone al navegador.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { system, messages, max_tokens } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Falta el arreglo de mensajes' });
  }

  const nvMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  try {
    const nvRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages: nvMessages,
        max_tokens: max_tokens || 1000,
        temperature: 0.6,
        stream: false
      })
    });

    if (!nvRes.ok) {
      const errText = await nvRes.text();
      console.error('NVIDIA API error:', nvRes.status, errText);
      return res.status(502).json({ error: 'Error al llamar a la API de NVIDIA', detail: errText });
    }

    const data = await nvRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message });
  }
}
