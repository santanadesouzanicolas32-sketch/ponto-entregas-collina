"""Ferramentas do gerente (linha de comando): validar, consolidar e conferir os fechamentos dos entregadores.

    python consolidar.py validar  entregas/*.json
    python consolidar.py consolidar entregas/ -o consolidado.json
    python consolidar.py resumo consolidado.json
    python consolidar.py exemplo exemplos/            (gera arquivos de EXEMPLO para testar o painel)

As regras são as mesmas do site (gerente.html): mesmo formato, mesmo código de integridade (SHA-256 do conteúdo canônico),
mesma regra de junção (para o mesmo turno vale o arquivo exportado mais recentemente) e mesmo cálculo de horas líquidas.
"""
from __future__ import annotations

import hashlib
import json
import random
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import typer

FORMATO = "ponto-collina/entregas"
FORMATO_CONSOLIDADO = "ponto-collina/consolidado"
EQUIPE = {"pedro": "Pedro", "bruno": "Bruno", "joao": "João", "kaua": "Kauã", "nicolas": "Nicolas"}
BLOCOS = ("A1", "B1", "C1", "A2", "B2", "C2")
FUSO = ZoneInfo("America/Sao_Paulo")
SHA = re.compile(r"^sha256:[0-9a-f]{64}$")

app = typer.Typer(add_completion=False, no_args_is_help=True, help="Ferramentas do gerente do Ponto de Entregas Collina.")


class ArquivoInvalido(ValueError):
    """Arquivo recusado (formato, integridade ou dados)."""


# ---------------------------------------------------------------- integridade
def canonico(v: Any) -> str:
    """JSON canônico: chaves ordenadas, sem espaços. Idêntico ao `canonical()` do JavaScript."""
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def codigo_integridade(entregador: str, turnos: list[dict]) -> str:
    return "sha256:" + hashlib.sha256(canonico({"entregador": entregador, "turnos": turnos}).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- validação
def normalizar_apto(bruto: Any) -> tuple[str, int]:
    """Mesma regra do aplicativo: andar 1 a 28 + final 1 a 9 (241), ou SS + número (SS12)."""
    apto = re.sub(r"\s+", "", str(bruto or "")).upper()
    if re.fullmatch(r"SS\d{1,2}", apto):
        return apto, 0
    if re.fullmatch(r"[1-9]\d{1,2}", apto):
        andar, final = divmod(int(apto), 10)
        if 1 <= andar <= 28 and final >= 1:
            return str(int(apto)), andar
    raise ValueError("apartamento inválido")


def _num(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


@dataclass
class Pacote:
    entregador: str
    turnos: list[dict]
    exportado_em: int
    exemplo: bool = False
    descartadas: int = 0
    turnos_descartados: int = 0
    arquivo: str = ""


def limpar_turnos(brutos: Any, entregador: str) -> tuple[list[dict], int, int]:
    if not isinstance(brutos, list):
        raise ArquivoInvalido("Arquivo sem a lista de turnos.")
    if len(brutos) > 5000:
        raise ArquivoInvalido("Arquivo grande demais.")
    saida, descartadas, turnos_desc = [], 0, 0
    for s in brutos:
        ok = (isinstance(s, dict) and all(_num(s.get(k)) for k in ("entrada", "previstoIni", "previstoFim"))
              and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(s.get("data"))) and s["previstoFim"] > s["previstoIni"]
              and (s.get("saida") is None or (_num(s["saida"]) and s["saida"] > s["entrada"])))
        if not ok:
            turnos_desc += 1
            continue
        pausas = [{"i": p["i"], "f": p.get("f")} for p in s.get("pausas") or []
                  if isinstance(p, dict) and _num(p.get("i")) and (p.get("f") is None or (_num(p["f"]) and p["f"] > p["i"]))]
        entregas = []
        for d in s.get("entregas") or []:
            try:
                if not isinstance(d, dict) or not _num(d.get("t")):
                    raise ValueError
                if d.get("bloco") not in BLOCOS:
                    raise ValueError
                apto, andar = normalizar_apto(d.get("apto"))
                valor = d.get("valor")
                valor = valor if isinstance(valor, int) and not isinstance(valor, bool) and 0 <= valor <= 1_000_000 else None
                original = d.get("original")
                if isinstance(original, dict):
                    try:
                        if original.get("bloco") not in BLOCOS:
                            raise ValueError("bloco")
                        original = {"bloco": original["bloco"], "apto": normalizar_apto(original.get("apto"))[0],
                                    "valor": original.get("valor") if isinstance(original.get("valor"), int) else None}
                    except ValueError:
                        original = None
                else:
                    original = None
                entregas.append({"id": str(d.get("id") or f"{s.get('id')}-{d['t']}")[:64], "t": d["t"], "bloco": d["bloco"], "apto": apto, "andar": andar, "valor": valor,
                                 "origem": "photo" if d.get("origem") in ("photo", "foto") else "manual", "conferir": bool(d.get("conferir")), "original": original,
                                 "editadaEm": d.get("editadaEm") if _num(d.get("editadaEm")) else None, "excluida": bool(d.get("excluida")),
                                 "excluidaEm": d.get("excluidaEm") if _num(d.get("excluidaEm")) else None,
                                 "tardia": bool(d.get("tardia")) and _num(d.get("registradaEm")),
                                 "registradaEm": d.get("registradaEm") if d.get("tardia") and _num(d.get("registradaEm")) else None})
            except (ValueError, KeyError):
                descartadas += 1
        saida.append({"id": str(s.get("id") or f"{entregador}-{s['data']}-{s['entrada']}")[:64], "data": s["data"], "preset": 16 if s.get("preset") == 16 else 15,
                      "previstoIni": s["previstoIni"], "previstoFim": s["previstoFim"], "entrada": s["entrada"], "saida": s.get("saida"),
                      "saidaAutomatica": bool(s.get("saidaAutomatica")), "pausas": pausas, "entregas": entregas})
    return saida, descartadas, turnos_desc


def ler_pacotes(obj: Any, arquivo: str = "") -> list[Pacote]:
    """Valida o conteúdo de UM arquivo (fechamento ou consolidado). Joga ArquivoInvalido se algo não confere."""
    if not isinstance(obj, dict):
        raise ArquivoInvalido("Arquivo inválido.")
    if obj.get("formato") == FORMATO_CONSOLIDADO and isinstance(obj.get("entregadores"), list):
        return [p for e in obj["entregadores"] for p in ler_pacotes(e, arquivo)]
    if obj.get("formato") != FORMATO or obj.get("versao") != 2:
        raise ArquivoInvalido("Formato não reconhecido. Use o arquivo gerado por “Enviar fechamento ao gerente”.")
    rid = (obj.get("entregador") or {}).get("id")
    if rid not in EQUIPE:
        raise ArquivoInvalido(f"Entregador desconhecido ({str(rid)[:30]!r}). Aceitos: {', '.join(EQUIPE.values())}.")
    cod = obj.get("integridade")
    if not isinstance(cod, str) or not SHA.match(cod):
        raise ArquivoInvalido("Arquivo sem código de integridade.")
    if codigo_integridade(rid, obj.get("turnos")) != cod:
        raise ArquivoInvalido("O conteúdo do arquivo não confere com o código de integridade (arquivo alterado ou corrompido).")
    turnos, desc, tdesc = limpar_turnos(obj.get("turnos"), rid)
    exp = obj.get("exportadoEm")
    return [Pacote(rid, turnos, int(exp) if _num(exp) else 0, bool(obj.get("exemplo")), desc, tdesc, arquivo)]


def ler_arquivo(caminho: Path) -> list[Pacote]:
    try:
        obj = json.loads(caminho.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ArquivoInvalido("Não é um arquivo JSON válido.") from e
    return ler_pacotes(obj, caminho.name)


# ---------------------------------------------------------------- junção
@dataclass
class Base:
    """Turnos por entregador. Para o mesmo turno vale a versão do arquivo exportado mais recentemente."""
    turnos: dict[str, dict[str, dict]] = field(default_factory=dict)      # entregador -> id do turno -> turno
    exportado_em: dict[str, int] = field(default_factory=dict)
    arquivos: dict[str, int] = field(default_factory=dict)

    def juntar(self, p: Pacote) -> dict[str, int]:
        atual = self.turnos.setdefault(p.entregador, {})
        r = {"novos": 0, "atualizados": 0, "mantidos": 0}
        for s in p.turnos:
            antigo = atual.get(s["id"])
            if antigo is None:
                atual[s["id"]] = {**s, "_exp": p.exportado_em}
                r["novos"] += 1
            elif p.exportado_em >= antigo["_exp"]:
                atual[s["id"]] = {**s, "_exp": p.exportado_em}
                r["atualizados"] += 1
            else:
                r["mantidos"] += 1
        self.exportado_em[p.entregador] = max(self.exportado_em.get(p.entregador, 0), p.exportado_em)
        self.arquivos[p.entregador] = self.arquivos.get(p.entregador, 0) + 1
        return r

    def consolidado(self) -> dict:
        entregadores = []
        for rid in EQUIPE:
            if rid not in self.turnos:
                continue
            turnos = sorted(({k: v for k, v in s.items() if k != "_exp"} for s in self.turnos[rid].values()), key=lambda s: s["entrada"])
            entregadores.append({"formato": FORMATO, "versao": 2, "entregador": {"id": rid, "nome": EQUIPE[rid]}, "exportadoEm": self.exportado_em[rid],
                                 "turnos": turnos, "integridade": codigo_integridade(rid, turnos)})
        return {"formato": FORMATO_CONSOLIDADO, "versao": 2, "geradoEm": int(datetime.now(timezone.utc).timestamp() * 1000), "entregadores": entregadores}


# ---------------------------------------------------------------- cálculos (espelho do site)
def segundos_liquidos(turno: dict, referencia_ms: int) -> int:
    """Horas líquidas = entrada até a saída (ou até o envio, se aberto) menos a UNIÃO das pausas."""
    fim = turno["saida"] if turno.get("saida") is not None else max(referencia_ms, turno["entrada"])
    ini = turno["entrada"]
    intervalos = sorted((max(p["i"], ini), min(p["f"] if p["f"] is not None else fim, fim)) for p in turno["pausas"])
    unidas: list[list[int]] = []
    for a, b in intervalos:
        if b <= a:
            continue
        if unidas and a <= unidas[-1][1]:
            unidas[-1][1] = max(unidas[-1][1], b)
        else:
            unidas.append([a, b])
    pausa = sum(b - a for a, b in unidas)
    return max(0, (fim - ini - pausa) // 1000)


def resumo_entregador(turnos: list[dict], exportado_em: int) -> dict:
    liquido = entregas = vendido = com_valor = 0
    for t in turnos:
        liquido += segundos_liquidos(t, exportado_em)
        vivas = [d for d in t["entregas"] if not d["excluida"]]
        entregas += len(vivas)
        for d in vivas:
            if d["valor"] is not None:
                vendido += d["valor"]
                com_valor += 1
    return {"turnos": len(turnos), "entregas": entregas, "horas_liquidas": liquido / 3600, "entregas_por_hora": (entregas / (liquido / 3600)) if liquido >= 4 * 3600 else None,
            "vendido_centavos": vendido, "ticket_centavos": (vendido / com_valor) if com_valor else None, "com_valor": com_valor}


# ---------------------------------------------------------------- gerador de exemplo
def ms(d: date, hora: int, minuto: int = 0, segundo: int = 0) -> int:
    return int(datetime(d.year, d.month, d.day, hora, minuto, segundo, tzinfo=FUSO).astimezone(timezone.utc).timestamp() * 1000)


PERFIS = {  # ritmo base (entregas/h), preset, probabilidade de informar valor, de ler por foto
    "pedro": (7.5, 15, 0.92, 0.7), "bruno": (6.0, 16, 0.85, 0.5), "joao": (5.0, 15, 0.7, 0.3), "kaua": (6.5, 16, 0.9, 0.8), "nicolas": (5.5, 15, 0.95, 0.6),
}


def gerar_exemplo(entregador: str, fim: date, dias: int, semente: int = 7) -> dict:
    """Fechamento de EXEMPLO (marcado com "exemplo": true). Determinístico para a mesma semente."""
    rnd = random.Random(f"{semente}-{entregador}")
    ritmo, preset, p_valor, p_foto = PERFIS[entregador]
    turnos = []
    for i in range(dias, 0, -1):
        dia = fim - timedelta(days=i)
        if dia.weekday() == 0 and rnd.random() < 0.6:       # folga na segunda
            continue
        previsto_ini, dur_min = ms(dia, preset), 500 if preset == 15 else 520
        entrada = previsto_ini + int(rnd.uniform(-10, 14) * 60000)
        previsto_fim = previsto_ini + dur_min * 60000
        saida = previsto_fim + int(rnd.uniform(-12, 25) * 60000)
        ini_p = entrada + int(rnd.uniform(200, 260) * 60000)
        pausas = [{"i": ini_p, "f": ini_p + int(rnd.uniform(10, 25) * 60000)}]
        melhora = 1 + (dias - i) * 0.006                     # evolução lenta ao longo do período
        t, entregas, k = entrada + int(rnd.uniform(5, 15) * 60000), [], 0
        while True:
            hora = datetime.fromtimestamp(t / 1000, FUSO).hour
            forca = 1.25 if 19 <= hora <= 21 else 0.8 if hora >= 22 else 1.0
            t += int(60000 * 60 / max(1.0, ritmo * melhora * forca * rnd.uniform(0.6, 1.4)))
            if t > saida - 120000:
                break
            if pausas[0]["i"] <= t <= pausas[0]["f"]:
                t = pausas[0]["f"] + 60000
            andar = 0 if rnd.random() < 0.04 else rnd.randint(1, 28)
            apto = f"SS{rnd.randint(1, 20)}" if andar == 0 else f"{andar}{rnd.randint(1, 4)}"
            valor = int((20 + rnd.random() * rnd.random() * 170) * 100) if rnd.random() < p_valor else None
            bloco = rnd.choice(BLOCOS)
            e = {"id": f"{entregador}-{dia}-{k}", "t": t, "bloco": bloco, "apto": apto, "andar": andar, "valor": valor, "origem": "photo" if rnd.random() < p_foto else "manual",
                 "conferir": False, "original": None, "editadaEm": None, "excluida": False, "excluidaEm": None,
                 "tardia": False, "registradaEm": None}
            if rnd.random() < 0.04:                       # entrega esquecida, lançada depois
                e["tardia"], e["registradaEm"] = True, t + int(rnd.uniform(5, 50) * 60000)
            if rnd.random() < 0.03:
                e["original"] = {"bloco": bloco, "apto": f"{max(1, andar)}{(int(apto[-1]) % 4) + 1}" if andar else apto, "valor": valor}
                e["editadaEm"] = t + int(rnd.uniform(1, 30) * 60000)
            elif rnd.random() < 0.015:
                e["excluida"], e["excluidaEm"] = True, t + 120000
            entregas.append(e)
            k += 1
        turnos.append({"id": f"{entregador}-{dia}", "data": dia.isoformat(), "preset": preset, "previstoIni": previsto_ini, "previstoFim": previsto_fim, "entrada": entrada, "saida": saida,
                       "saidaAutomatica": False, "pausas": pausas, "entregas": entregas})
    return {"formato": FORMATO, "versao": 2, "exemplo": True, "entregador": {"id": entregador, "nome": EQUIPE[entregador]},
            "exportadoEm": ms(fim, 8), "turnos": turnos, "integridade": codigo_integridade(entregador, turnos)}


# ---------------------------------------------------------------- comandos
def _reais(centavos: float | int | None) -> str:
    return "—" if centavos is None else f"R$ {centavos / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _coletar(caminhos: list[Path]) -> list[Path]:
    arquivos: list[Path] = []
    for c in caminhos:
        arquivos += sorted(c.rglob("*.json")) if c.is_dir() else [c]
    return arquivos


@app.command()
def validar(arquivos: list[Path] = typer.Argument(..., help="Arquivos ou pastas com fechamentos (.json).")) -> None:
    """Confere formato, entregador e código de integridade de cada arquivo."""
    ruins = 0
    for f in _coletar(arquivos):
        try:
            for p in ler_arquivo(f):
                n = sum(len(t["entregas"]) for t in p.turnos)
                typer.echo(f"OK    {f.name}: {EQUIPE[p.entregador]}, {len(p.turnos)} turno(s), {n} registro(s)" + (f", {p.descartadas} descartado(s)" if p.descartadas else "") + ("  [EXEMPLO]" if p.exemplo else ""))
        except ArquivoInvalido as e:
            ruins += 1
            typer.echo(f"ERRO  {f.name}: {e}")
    raise typer.Exit(1 if ruins else 0)


@app.command()
def consolidar(pasta: Path = typer.Argument(..., help="Pasta com os fechamentos."), saida: Path = typer.Option(Path("consolidado.json"), "--saida", "-o", help="Arquivo consolidado.")) -> None:
    """Junta todos os fechamentos válidos em um arquivo único, para importar no sistema do gerente."""
    base, ruins = Base(), 0
    for f in _coletar([pasta]):
        try:
            for p in ler_arquivo(f):
                r = base.juntar(p)
                typer.echo(f"OK    {f.name}: {EQUIPE[p.entregador]} (+{r['novos']} novos, {r['atualizados']} atualizados, {r['mantidos']} mantidos)")
        except ArquivoInvalido as e:
            ruins += 1
            typer.echo(f"ERRO  {f.name}: {e} (ignorado)")
    if not base.turnos:
        typer.echo("Nenhum arquivo válido encontrado.")
        raise typer.Exit(2)
    saida.write_text(json.dumps(base.consolidado(), ensure_ascii=False), encoding="utf-8")
    typer.echo(f"\nConsolidado gravado em {saida} ({len(base.turnos)} entregador(es)){f'; {ruins} arquivo(s) ignorado(s)' if ruins else ''}.")


@app.command()
def resumo(arquivo: Path = typer.Argument(..., help="Arquivo consolidado ou fechamento.")) -> None:
    """Mostra totais por entregador (para conferir com o painel)."""
    base = Base()
    for p in ler_arquivo(arquivo):
        base.juntar(p)
    typer.echo(f"{'Entregador':<10} {'Turnos':>6} {'Horas':>7} {'Entregas':>8} {'Entr./h':>8} {'Vendido':>14} {'Ticket':>10}")
    for rid in EQUIPE:
        if rid not in base.turnos:
            continue
        r = resumo_entregador(list(base.turnos[rid].values()), base.exportado_em[rid])
        ph = "—" if r["entregas_por_hora"] is None else f"{r['entregas_por_hora']:.1f}".replace(".", ",")
        typer.echo(f"{EQUIPE[rid]:<10} {r['turnos']:>6} {r['horas_liquidas']:>7.1f} {r['entregas']:>8} {ph:>8} {_reais(r['vendido_centavos']):>14} {_reais(r['ticket_centavos']):>10}")


@app.command()
def exemplo(pasta: Path = typer.Argument(Path("exemplos")), dias: int = typer.Option(21, help="Quantos dias gerar."), fim: str = typer.Option("", help="Último dia (AAAA-MM-DD). Padrão: hoje."),
            semente: int = typer.Option(7, help="Semente: a mesma semente gera os mesmos dados.")) -> None:
    """Gera um arquivo de EXEMPLO por entregador, para testar o sistema do gerente."""
    ultimo = date.fromisoformat(fim) if fim else datetime.now(FUSO).date()
    pasta.mkdir(parents=True, exist_ok=True)
    for rid in EQUIPE:
        dados = gerar_exemplo(rid, ultimo, dias, semente)
        destino = pasta / f"EXEMPLO-entregas-{rid}-{ultimo}.json"
        destino.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
        typer.echo(f"{destino} ({len(dados['turnos'])} turnos)")


if __name__ == "__main__":
    import sys

    for fluxo in (sys.stdout, sys.stderr):  # acentos corretos também no terminal do Windows
        try:
            fluxo.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    app()
