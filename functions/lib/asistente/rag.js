// Búsqueda de evidencia para la ruta general.
// Producción: Vectorize + bge-m3. Pruebas locales: corpus léxico solo si
// ASSISTANT_LOCAL_CORPUS=1. Sin evidencia no se inventa una respuesta.

import { normalizarParaCoincidencia } from './guardas.js';
import { CORPUS_SITIO } from './corpus-data.js';

const STOP = new Set(['que', 'de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un', 'una', 'para', 'con', 'por', 'es', 'se', 'su', 'al', 'del', 'lo', 'como', 'mas', 'o', 'si', 'no', 'me', 'mi', 'le', 'les', 'esto', 'eso', 'cual', 'cuales', 'cuanto', 'cuanta']);

function tokens(texto) {
  return normalizarParaCoincidencia(texto).split(' ').filter((t) => t.length > 2 && !STOP.has(t));
}

export function buscarCorpusLocal(consulta, limite = 4) {
  const q = new Set(tokens(consulta));
  if (q.size === 0) return [];
  return CORPUS_SITIO
    .map((chunk) => {
      const t = tokens(chunk.titulo + ' ' + chunk.texto);
      let score = 0;
      for (const token of t) if (q.has(token)) score++;
      return { ...chunk, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

function chunkDesdeMetadata(match) {
  // score: similitud coseno de Vectorize sobre embeddings bge-m3 (0..1);
  // valores altos indican mayor cercanía semántica con la consulta.
  const md = match?.metadata || {};
  const id = md.id || match?.id;
  const local = CORPUS_SITIO.find((c) => c.id === id);
  if (local) return { ...local, score: match.score ?? 0 };
  if (md.texto && md.titulo && md.url) return { id, titulo: md.titulo, url: md.url, texto: md.texto, score: match.score ?? 0 };
  return null;
}

export async function buscarEvidencia(env, consulta, limite = 4) {
  if (env?.VECTORIZE && env?.AI) {
    try {
      const emb = await env.AI.run(env.WORKERS_EMBEDDING_MODEL || '@cf/baai/bge-m3', { text: [consulta] });
      const vector = emb?.data?.[0] || emb?.result?.data?.[0];
      if (Array.isArray(vector)) {
        const res = await env.VECTORIZE.query(vector, { topK: 8, returnMetadata: 'all' });
        const chunks = (res?.matches || []).map(chunkDesdeMetadata).filter(Boolean).slice(0, limite);
        if (chunks.length > 0) return chunks;
      }
    } catch {
      return [];
    }
    return [];
  }
  if (env?.ASSISTANT_LOCAL_CORPUS === '1') return buscarCorpusLocal(consulta, limite);
  return [];
}

export function evidenciaPorId(evidencia, id) {
  return (evidencia || []).find((e) => e.id === id) || null;
}
