// Alterna os cliques de WhatsApp entre dois números (1, 2, 1, 2...).
// Um contador atômico (INCR) no Upstash Redis decide o número da vez.
//
// Variáveis de ambiente (criadas pela integração Upstash da Vercel):
//   KV_REST_API_URL / KV_REST_API_TOKEN  (ou UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
//
// Regras:
// - Quem já foi atendido por um número (cookie cs_wa) continua no mesmo, sem gastar a vez.
// - Se o Redis falhar, sorteia um número: o botão nunca fica sem resposta.
// - O destino é sempre wa.me + número fixo + mensagem fixa (não aceita URL de fora).

const NUMEROS = ['5516981530344', '5516992279954'];

const MENSAGENS = {
  'limpa-nome':
    'Oi, vim pelo Instagram da Confie Score e quero avaliar minha situação para entender se existe possibilidade de limpar meu nome.',
  'rating-comercial':
    'Oi, vim pelo Instagram da Confie Score e quero entender o que pode estar dificultando minha análise bancária e como posso melhorar isso.',
  whatsapp:
    'Oi, vim pelo Instagram da Confie Score e quero entender melhor o meu caso para saber qual caminho faz mais sentido para mim.',
};

const CHAVE_CONTADOR = 'bioig:wa:contador';
const COOKIE = 'cs_wa';
const COOKIE_SEGUNDOS = 60 * 60 * 24 * 30;

function lerCookie(req) {
  const bruto = req.headers.cookie || '';
  const par = bruto.split(';').map((p) => p.trim()).find((p) => p.startsWith(COOKIE + '='));
  const valor = par ? par.slice(COOKIE.length + 1) : '';
  return valor === '0' || valor === '1' ? Number(valor) : null;
}

async function proximoIndice() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('redis nao configurado');

  const resposta = await fetch(url.replace(/\/$/, '') + '/incr/' + encodeURIComponent(CHAVE_CONTADOR), {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(2500),
  });
  const corpo = await resposta.json();
  if (!resposta.ok || typeof corpo.result !== 'number') throw new Error('resposta invalida do redis');
  return (corpo.result - 1) % 2;
}

module.exports = async function handler(req, res) {
  const chaveMensagem = String((req.query && req.query.m) || '');
  const mensagem = MENSAGENS[chaveMensagem] || MENSAGENS.whatsapp;

  let indice = lerCookie(req);
  const jaAtendido = indice !== null;

  // HEAD (pré-visualizações, verificadores) nunca consome a vez.
  if (indice === null && req.method !== 'HEAD') {
    try {
      indice = await proximoIndice();
    } catch (erro) {
      console.error('zap: contador indisponivel, usando sorteio');
      indice = Math.random() < 0.5 ? 0 : 1;
    }
  }
  if (indice === null) indice = 0;

  if (!jaAtendido && req.method !== 'HEAD') {
    res.setHeader('Set-Cookie', COOKIE + '=' + indice + '; Max-Age=' + COOKIE_SEGUNDOS + '; Path=/; SameSite=Lax; Secure');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Location', 'https://wa.me/' + NUMEROS[indice] + '?text=' + encodeURIComponent(mensagem));
  res.statusCode = 302;
  res.end();
};

module.exports.NUMEROS = NUMEROS;
module.exports.MENSAGENS = MENSAGENS;
