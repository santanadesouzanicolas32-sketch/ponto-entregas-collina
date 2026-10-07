/* Células de planilha CSV sem injeção de fórmula. */
function csvSafe(v) { const s = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }
function csvCell(v) { const s = csvSafe(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
