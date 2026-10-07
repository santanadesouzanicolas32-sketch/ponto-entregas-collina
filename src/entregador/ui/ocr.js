/* Interface do entregador: leitura da comanda por foto. */
/* ---------------- leitura da comanda por foto (OCR no próprio aparelho) ---------------- */
const OCR = { worker: null, loading: null, onProgress: null };
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.dataset.src = src; s.onload = res; s.onerror = () => rej(new Error('offline'));
    document.head.appendChild(s);
  });
}
function getOcrWorker() {
  if (OCR.worker) return Promise.resolve(OCR.worker);
  if (!OCR.loading) {
    OCR.loading = (async () => {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
      const w = await Tesseract.createWorker('eng', 1, { logger: (m) => OCR.onProgress && OCR.onProgress(m) });
      OCR.worker = w;
      return w;
    })().catch((e) => { OCR.loading = null; throw e; });
  }
  return OCR.loading;
}
let warmed = false;
function warmUpOcr() {          // baixa o leitor em segundo plano durante o turno (fica em cache do navegador)
  if (warmed || !navigator.onLine) return;
  warmed = true;
  getOcrWorker().catch(() => { warmed = false; });
}

/** Foto -> duas versões reduzidas: tons de cinza e binarizada (limiar adaptativo, tolera sombra, ruído e papel amassado). */
async function prepareImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const k = Math.min(1, CFG.maxPhotoSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const gray = document.createElement('canvas');
  gray.width = w; gray.height = h;
  const g = gray.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const img = g.getImageData(0, 0, w, h), px = img.data, lum = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) { const y = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0; lum[j] = y; px[i] = px[i + 1] = px[i + 2] = y; }
  g.putImageData(img, 0, 0);
  return { gray, bin: binarize(lum, w, h) };
}
/** Limiar adaptativo por imagem integral: pixel escuro em relação à média local vira preto, o resto branco. */
function binarize(lum, w, h) {
  const W = w + 1, integral = new Float64Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) { row += lum[(y - 1) * w + (x - 1)]; integral[y * W + x] = integral[(y - 1) * W + x] + row; }
  }
  const r = Math.max(10, Math.round(Math.min(w, h) / 35));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true }), out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0)), v = lum[y * w + x] < mean * 0.86 ? 0 : 255, o = (y * w + x) * 4;
      out.data[o] = out.data[o + 1] = out.data[o + 2] = v; out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

async function readComanda(file) {
  const at = now();                                   // horário da entrega = momento da foto
  sheet(`<h3>Lendo a comanda…</h3><div class="progress"><div id="ocrBar" style="width:6%"></div></div><p class="mut" id="ocrMsg" style="font-size:13px">Preparando a imagem. A foto não sai do seu aparelho e não fica guardada.</p>`);
  const setProgress = (p, msg) => { const b = $('ocrBar'); if (b) b.style.width = Math.round(p * 100) + '%'; const m = $('ocrMsg'); if (m && msg) m.textContent = msg; };
  OCR.onProgress = (m) => {
    if (m.status === 'recognizing text') setProgress(0.4 + m.progress * 0.5, 'Lendo o texto…');
    else if (/load|init/i.test(m.status || '')) setProgress(0.15 + (m.progress || 0) * 0.2, 'Carregando o leitor (só na primeira vez)…');
  };
  let best = null, failure = null;
  try {
    const { gray, bin } = await prepareImage(file);
    setProgress(0.12);
    const worker = await getOcrWorker();
    // até 4 tentativas: imagem binarizada e em cinza, nos modos de página "automático" e "texto esparso"
    const plan = [[bin, '3'], [gray, '3'], [bin, '11'], [gray, '11']];
    for (let i = 0; i < plan.length; i++) {
      const [cv, psm] = plan[i];
      if (i) setProgress(0.4, 'Tentando de novo com outro ajuste…');
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      const text = (await worker.recognize(cv)).data.text;
      const r = parseComanda(text);                     // o texto bruto (nome/telefone) não é guardado em lugar nenhum
      const rank = { nenhuma: 0, baixa: 1, media: 2, alta: 3 };
      if (!best || rank[r.confidence] > rank[best.confidence]) best = r;
      if (r.readable && r.confidence === 'alta') break;
    }
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
    gray.width = gray.height = bin.width = bin.height = 0;     // descarta a imagem
  } catch (e) { failure = e; console.warn('Leitura da foto falhou:', e && e.message); }
  OCR.onProgress = null;
  const result = best;
  if (failure || !result) {
    deliverySheet({ title: 'Digite o bloco e o apto', at, source: 'photo', note: !navigator.onLine ? '!Sem internet para carregar o leitor de fotos. Digite o bloco e o apto; o horário da foto foi guardado.' : '!Não consegui ler a foto. Digite o bloco e o apto; o horário da foto foi guardado.' });
  } else if (result.readable) {
    // leitura segura (bloco e apto explícitos) e valor sem dúvida (ou ausente): registra sozinho, com "Desfazer"
    const sure = result.confidence === 'alta' && (result.value == null || result.valueSure);
    if (DB.prefs.autoPhoto && sure) {
      try {
        const { delivery } = addDelivery(result.block, result.apt, { at, source: 'photo', review: false, value: result.value });
        closeSheet(); render();
        try { navigator.vibrate?.(40); } catch { /* ignore */ }
        toastAction(`✓ ${delivery.block} ${delivery.apt}${delivery.v != null ? ' · ' + brl(delivery.v) : ''}`, 'Desfazer', () => { undoDelivery(delivery.id); render(); toast('Entrega desfeita'); }, 8000);
        return;
      } catch (e) { /* duplicada, pausa, etc.: cai na confirmação manual abaixo */ }
    }
    deliverySheet({ title: 'Confirme a leitura', block: result.block, apt: result.apt, at, source: 'photo', review: result.needsReview, value: result.value, note: result.needsReview ? '!Leitura incerta. Confira o bloco e o apartamento antes de registrar.' : result.value != null && !result.valueSure ? '!Confira também o valor lido.' : 'Leitura automática. Confira e toque em Registrar.' });
  } else {
    deliverySheet({ title: 'Digite o bloco e o apto', block: result.block, apt: result.apt || '', at, source: 'photo', value: result.value, note: '!Não consegui ler tudo na foto. Complete o que faltou; o horário da foto foi guardado.' });
  }
}
$('file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) readComanda(f); });
