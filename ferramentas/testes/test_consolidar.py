import copy
import json
from datetime import date
from pathlib import Path

import pytest
from typer.testing import CliRunner

import consolidar as c

FIXTURE = Path(__file__).parent / "fixtures" / "export_js.json"
runner = CliRunner()


def com_integridade(obj: dict) -> dict:
    obj["integridade"] = c.codigo_integridade(obj["entregador"]["id"], obj["turnos"])
    return obj


def exemplo(rid="pedro", dias=14, fim=date(2026, 10, 7)):
    return c.gerar_exemplo(rid, fim, dias, semente=1)


# ---------------------------------------------------------------- integridade (compatível com o JavaScript)
def test_codigo_de_integridade_gerado_pelo_site_e_aceito_pelo_python():
    """O arquivo foi produzido pelo navegador (com acentos, nulos e booleanos): o Python precisa chegar ao MESMO código."""
    obj = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert c.codigo_integridade("joao", obj["turnos"]) == obj["integridade"]
    pacote = c.ler_pacotes(obj)[0]
    assert pacote.entregador == "joao" and len(pacote.turnos[0]["entregas"]) == 3 and pacote.turnos[0]["id"] == "turno-ção-é1"


def test_forma_canonica():
    assert c.canonico({"b": 1, "a": [2, {"d": None, "c": "x"}]}) == '{"a":[2,{"c":"x","d":null}],"b":1}'
    assert c.canonico({"n": "João", "t": True}) == '{"n":"João","t":true}'


def test_alteracao_do_conteudo_e_detectada():
    obj = json.loads(FIXTURE.read_text(encoding="utf-8"))
    obj["turnos"][0]["entregas"][0]["valor"] = 9999
    with pytest.raises(c.ArquivoInvalido, match="não confere"):
        c.ler_pacotes(obj)


@pytest.mark.parametrize("mudanca,msg", [
    (lambda o: o.pop("integridade"), "integridade"),
    (lambda o: o.update(integridade="sha256:xyz"), "integridade"),
    (lambda o: o.update(entregador={"id": "maria", "nome": "Maria"}), "desconhecido"),
    (lambda o: o.update(versao=1), "Formato"),
    (lambda o: o.update(formato="outro"), "Formato"),
])
def test_arquivos_recusados(mudanca, msg):
    obj = json.loads(FIXTURE.read_text(encoding="utf-8"))
    mudanca(obj)
    with pytest.raises(c.ArquivoInvalido, match=msg):
        c.ler_pacotes(obj)


@pytest.mark.parametrize("lixo", [None, 5, "x", [], {}])
def test_conteudo_que_nao_e_fechamento(lixo):
    with pytest.raises(c.ArquivoInvalido):
        c.ler_pacotes(lixo)


# ---------------------------------------------------------------- validação dos dados
@pytest.mark.parametrize("apto,esperado", [("241", ("241", 24)), (" 241 ", ("241", 24)), ("12", ("12", 1)), ("281", ("281", 28)), ("ss12", ("SS12", 0)), ("2 4 1", ("241", 24))])
def test_apartamentos_validos(apto, esperado):
    assert c.normalizar_apto(apto) == esperado


@pytest.mark.parametrize("apto", ["", "0101", "291", "240", "011", "05", "abc", "SS", "SS123", "1", None, "-241"])
def test_apartamentos_invalidos(apto):
    with pytest.raises(ValueError):
        c.normalizar_apto(apto)


def test_registros_invalidos_sao_descartados_e_contados():
    obj = json.loads(FIXTURE.read_text(encoding="utf-8"))
    obj["turnos"][0]["entregas"] += [{"id": "x", "t": 1, "bloco": "Z9", "apto": "241"}, {"id": "y", "t": 2, "bloco": "A1", "apto": "999"}, {"t": "a"}]
    obj["turnos"].append({"id": "ruim", "data": "lixo", "entrada": 1})
    p = c.ler_pacotes(com_integridade(obj))[0]
    assert (len(p.turnos), len(p.turnos[0]["entregas"]), p.descartadas, p.turnos_descartados) == (1, 3, 3, 1)


def test_valores_fora_do_limite_viram_sem_valor():
    obj = json.loads(FIXTURE.read_text(encoding="utf-8"))
    e = obj["turnos"][0]["entregas"]
    e[0]["valor"], e[1]["valor"] = -5, 99_999_999
    p = c.ler_pacotes(com_integridade(obj))[0]
    assert [d["valor"] for d in p.turnos[0]["entregas"][:2]] == [None, None]


# ---------------------------------------------------------------- junção
def test_reimportar_nao_duplica_e_vale_o_arquivo_mais_recente():
    base = c.Base()
    a = exemplo()
    p1 = c.ler_pacotes(a)[0]
    r1 = base.juntar(p1)
    assert r1["novos"] == len(a["turnos"]) and r1["atualizados"] == 0
    assert base.juntar(p1)["atualizados"] == len(a["turnos"])               # mesmo arquivo: não duplica
    assert len(base.turnos["pedro"]) == len(a["turnos"])
    novo = copy.deepcopy(a)
    novo["exportadoEm"] += 86_400_000
    novo["turnos"][0]["entregas"][0]["valor"] = 12345
    base.juntar(c.ler_pacotes(com_integridade(novo))[0])
    assert base.turnos["pedro"][novo["turnos"][0]["id"]]["entregas"][0]["valor"] == 12345
    r = base.juntar(p1)                                                    # arquivo antigo não sobrescreve o novo
    assert r["mantidos"] >= 1 and base.turnos["pedro"][novo["turnos"][0]["id"]]["entregas"][0]["valor"] == 12345


def test_consolidado_tem_integridade_valida_e_volta_inteiro():
    base = c.Base()
    for rid in ("kaua", "bruno"):
        base.juntar(c.ler_pacotes(exemplo(rid))[0])
    cons = base.consolidado()
    assert [e["entregador"]["id"] for e in cons["entregadores"]] == ["bruno", "kaua"]       # na ordem da equipe
    de_volta = c.ler_pacotes(json.loads(json.dumps(cons)))
    assert [p.entregador for p in de_volta] == ["bruno", "kaua"]
    assert sum(len(p.turnos) for p in de_volta) == sum(len(b.turnos[r]) for b in [base] for r in b.turnos)


# ---------------------------------------------------------------- cálculos
def turno(entrada_h, saida_h, pausas, entregas=()):
    h = 3_600_000
    return {"entrada": entrada_h * h, "saida": None if saida_h is None else saida_h * h, "pausas": [{"i": a * h, "f": None if b is None else b * h} for a, b in pausas],
            "entregas": [{"excluida": ex, "valor": v} for v, ex in entregas]}


def test_horas_liquidas_com_pausas_sobrepostas_e_turno_aberto():
    h = 3_600_000
    assert c.segundos_liquidos(turno(15, 23, []), 0) == 8 * 3600
    assert c.segundos_liquidos(turno(15, 23, [(18, 19)]), 0) == 7 * 3600
    assert c.segundos_liquidos(turno(15, 23, [(18, 19.5), (19, 20)]), 0) == 6.0 * 3600     # sobreposição não conta duas vezes
    assert c.segundos_liquidos(turno(15, 23, [(14, 15.5), (22.5, 25)]), 0) == (8 - 0.5 - 0.5) * 3600  # pausa recortada na jornada
    assert c.segundos_liquidos(turno(15, None, [(17, None)]), 19 * h) == 2 * 3600            # aberto: conta até o envio; pausa aberta conta até lá
    assert c.segundos_liquidos(turno(16, None, []), 15 * h) == 0


def test_resumo_do_entregador():
    t = turno(15, 20, [(17, 18)], [(5000, False), (3000, False), (None, False), (700, True)])
    r = c.resumo_entregador([t], 0)
    assert (r["entregas"], r["vendido_centavos"], r["com_valor"], r["horas_liquidas"]) == (3, 8000, 2, 4.0)
    assert r["entregas_por_hora"] == pytest.approx(3 / 4) and r["ticket_centavos"] == 4000
    assert c.resumo_entregador([turno(15, 17, [], [(1, False)])], 0)["entregas_por_hora"] is None   # menos de 4 h: sem taxa


# ---------------------------------------------------------------- gerador de exemplo
def test_exemplo_e_valido_marcado_e_reproduzivel():
    a, b = exemplo("nicolas"), exemplo("nicolas")
    assert a == b and a["exemplo"] is True
    p = c.ler_pacotes(a)[0]
    assert p.descartadas == 0 and p.turnos_descartados == 0 and len(p.turnos) >= 8
    assert all(0 <= d["andar"] <= 28 and d["bloco"] in c.BLOCOS for t in p.turnos for d in t["entregas"])
    assert all(t["saida"] > t["entrada"] for t in p.turnos)
    assert exemplo("nicolas") != c.gerar_exemplo("nicolas", date(2026, 10, 7), 14, semente=2)


# ---------------------------------------------------------------- linha de comando
def test_cli_exemplo_validar_consolidar_resumo(tmp_path):
    pasta = tmp_path / "ex"
    r = runner.invoke(c.app, ["exemplo", str(pasta), "--dias", "10", "--fim", "2026-10-07"])
    assert r.exit_code == 0, r.output
    assert len(list(pasta.glob("*.json"))) == 5
    r = runner.invoke(c.app, ["validar", str(pasta)])
    assert r.exit_code == 0 and r.output.count("OK ") == 5 and "[EXEMPLO]" in r.output
    saida = tmp_path / "cons.json"
    r = runner.invoke(c.app, ["consolidar", str(pasta), "-o", str(saida)])
    assert r.exit_code == 0 and saida.exists(), r.output
    cons = json.loads(saida.read_text(encoding="utf-8"))
    assert [e["entregador"]["nome"] for e in cons["entregadores"]] == ["Pedro", "Bruno", "João", "Kauã", "Nicolas"]
    r = runner.invoke(c.app, ["resumo", str(saida)])
    assert r.exit_code == 0 and all(n in r.output for n in ("Pedro", "Bruno", "João", "Kauã", "Nicolas"))


def test_cli_recusa_arquivo_adulterado_e_continua_com_os_outros(tmp_path):
    pasta = tmp_path / "in"
    pasta.mkdir()
    (pasta / "bom.json").write_text(json.dumps(exemplo("pedro")), encoding="utf-8")
    ruim = exemplo("bruno")
    ruim["turnos"][0]["entregas"][0]["valor"] = 1
    (pasta / "ruim.json").write_text(json.dumps(ruim), encoding="utf-8")
    (pasta / "lixo.json").write_text("{não é json", encoding="utf-8")
    r = runner.invoke(c.app, ["validar", str(pasta)])
    assert r.exit_code == 1 and "ERRO  ruim.json" in r.output and "ERRO  lixo.json" in r.output and "OK    bom.json" in r.output
    saida = tmp_path / "cons.json"
    r = runner.invoke(c.app, ["consolidar", str(pasta), "-o", str(saida)])
    assert r.exit_code == 0 and "2 arquivo(s) ignorado(s)" in r.output
    assert [e["entregador"]["id"] for e in json.loads(saida.read_text(encoding="utf-8"))["entregadores"]] == ["pedro"]


def test_cli_sem_arquivos_validos(tmp_path):
    (tmp_path / "x.json").write_text("[]", encoding="utf-8")
    r = runner.invoke(c.app, ["consolidar", str(tmp_path), "-o", str(tmp_path / "o.json")])
    assert r.exit_code == 2 and not (tmp_path / "o.json").exists()


# ---------------------------------------------------------------- entrega esquecida (lançada depois)
def test_entrega_lancada_depois_e_preservada_e_so_vale_com_a_hora_do_registro():
    obj = json.loads(FIXTURE.read_text(encoding="utf-8"))
    e = obj["turnos"][0]["entregas"]
    e[0]["tardia"], e[0]["registradaEm"] = True, e[0]["t"] + 25 * 60000
    e[1]["tardia"] = True                                     # sem hora do registro: não vale
    p = c.ler_pacotes(com_integridade(obj))[0]
    ent = p.turnos[0]["entregas"]
    assert (ent[0]["tardia"], ent[0]["registradaEm"]) == (True, e[0]["t"] + 25 * 60000)
    assert (ent[1]["tardia"], ent[1]["registradaEm"]) == (False, None)
    assert (ent[2]["tardia"], ent[2]["registradaEm"]) == (False, None)    # arquivo antigo, sem o campo


def test_exemplo_tem_entregas_lancadas_depois_com_registro_posterior():
    p = c.ler_pacotes(exemplo("kaua"))[0]
    tardias = [d for t in p.turnos for d in t["entregas"] if d["tardia"]]
    assert tardias and all(d["registradaEm"] > d["t"] for d in tardias)


def test_entrada_recuada_e_preservada_so_se_for_posterior_a_entrada():
    obj = json.loads(FIXTURE.read_text(encoding="utf-8"))
    t = obj["turnos"][0]
    t["entradaOriginal"] = t["entrada"] + 90 * 60000
    assert c.ler_pacotes(com_integridade(obj))[0].turnos[0]["entradaOriginal"] == t["entrada"] + 90 * 60000
    t["entradaOriginal"] = t["entrada"] - 1                      # não faz sentido: ignorada
    assert c.ler_pacotes(com_integridade(obj))[0].turnos[0]["entradaOriginal"] is None
    del t["entradaOriginal"]                                      # arquivo antigo, sem o campo
    assert c.ler_pacotes(com_integridade(obj))[0].turnos[0]["entradaOriginal"] is None


def test_instantes_absurdos_sao_descartados():
    obj = json.loads(FIXTURE.read_text(encoding="utf-8"))
    obj["turnos"][0]["entregas"][0]["t"] = 10 ** 20
    obj["turnos"][0]["entregas"][1]["editadaEm"] = -5
    p = c.ler_pacotes(com_integridade(obj))[0]
    assert len(p.turnos[0]["entregas"]) == 2 and p.descartadas == 1
    assert p.turnos[0]["entregas"][0]["editadaEm"] is None
