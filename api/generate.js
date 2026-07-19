// api/generate.js
// Backend de Ascend AI: recibe peticiones del frontend y las reenvía a la API
// gratuita de NVIDIA (NIM), usando la clave guardada como variable de entorno
// en Vercel (NVIDIA_API_KEY). La clave nunca se expone al navegador.
//
// Para la tarea "build" (crear webs), intenta primero con un modelo grande
// (mejor calidad de código) y si falla o tarda demasiado, cae automáticamente
// a un modelo más chico y confiable, sin que el usuario tenga que reintentar.

async function callNvidia(model, messages, maxTokens, timeoutMs, extraFields) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.6,
    stream: false,
    ...(extraFields || {})
  };

  try {
    const nvRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!nvRes.ok) {
      const errText = await nvRes.text();
      throw new Error(`NVIDIA ${model} error ${nvRes.status}: ${errText}`);
    }

    const data = await nvRes.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`NVIDIA ${model} timeout after ${timeoutMs / 1000}s`);
    }
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { system, messages, max_tokens, task } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Falta el arreglo de mensajes' });
  }

  const nvMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const maxTokens = max_tokens || 1000;

  try {
    let text;

    if (task === 'build') {
      // Intento 1: modelo grande, mejor calidad de código, con "thinking" apagado.
      try {
        text = await callNvidia(
          'deepseek-ai/deepseek-v4-pro',
          nvMessages,
          maxTokens,
          30000,
          { chat_template_kwargs: { thinking: false } }
        );
        if (!text) throw new Error('Respuesta vacía de DeepSeek');
      } catch (primaryErr) {
        console.error('DeepSeek falló, usando respaldo Llama:', primaryErr.message);
        // Intento 2 (respaldo): modelo chico y confiable.
        text = await callNvidia('meta/llama-3.1-8b-instruct', nvMessages, maxTokens, 25000);
      }
    } else {
      text = await callNvidia('meta/llama-3.1-8b-instruct', nvMessages, maxTokens, 25000);
    }

    return res.status(200).json({ text });
  } catch (err) {
    console.error('Server error:', err.message);
    return res.status(502).json({ error: 'No se pudo obtener respuesta de la IA. Intenta de nuevo.' });
  }
}
