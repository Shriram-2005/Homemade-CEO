export default async function handler(req, res) {
  const { tl = 'en', q = '' } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: 'Missing text query (q)' });
  }

  try {
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(q)}`;
    
    // Fetch from Google TTS
    const response = await fetch(googleTtsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' // Mask as a standard browser
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch TTS' });
    }

    // Set headers for audio response
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 's-maxage=86400'); // Cache for 24 hours
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow cross-origin

    // Pipe the audio buffer directly to the client
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
    
  } catch (error) {
    console.error('TTS Proxy Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
