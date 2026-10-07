"""Monta e confere o sistema. Uso:   python build.py          (confere tudo, monta e testa)
                                    python build.py --rapido  (só monta, sem conferir nem testar)

O que ele faz, nesta ordem (se uma etapa falha, as seguintes não rodam e os arquivos publicados não mudam):
  1. lint e regras de camadas      (tools/lint.mjs)
  2. consistência de botões e ids  (tools/consistencia.mjs)
  3. monta as páginas em .teste/pronto e as páginas de teste em .teste/ (não são publicadas)
  4. roda todos os testes (tools/testar.mjs) e os testes Python (ferramentas/testes)
  5. só então copia index.html e gerente.html para a raiz (o que o GitHub Pages publica)
"""
import base64
import json
import os
import shutil
import subprocess
import sys

for _f in (sys.stdout, sys.stderr):
    try:
        _f.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

AQUI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(AQUI, 'src')
TESTE = os.path.join(AQUI, '.teste')

COMPARTILHADO = [
    'compartilhado/equipe.js', 'compartilhado/dom.js', 'compartilhado/tempo.js', 'compartilhado/formato.js',
    'compartilhado/validacao.js', 'compartilhado/pedido.js', 'compartilhado/jornada.js', 'compartilhado/csv.js', 'compartilhado/integridade.js',
    'compartilhado/nuvem.js', 'compartilhado/interface.js',
]
ENTREGADOR = [
    'entregador/banco.js', 'entregador/turno.js', 'entregador/entregas.js', 'entregador/visao.js', 'entregador/relatorios.js',
    'entregador/fechamento.js', 'entregador/envio.js', 'entregador/comanda.js',
    'entregador/ui/navegacao.js', 'entregador/ui/turno.js', 'entregador/ui/registro.js', 'entregador/ui/ocr.js',
    'entregador/ui/historico.js', 'entregador/ui/ajustes.js', 'entregador/ui/inicio.js', 'entregador/ui/painel.js',
]
GERENTE = [
    'gerente/dados/armazenamento.js', 'gerente/dados/importacao.js', 'gerente/dados/calculo.js', 'gerente/dados/metricas.js',
    'gerente/dados/consulta.js', 'gerente/nuvem.js',
    'gerente/ui/navegacao.js', 'gerente/ui/graficos.js', 'gerente/ui/geral.js', 'gerente/ui/individual.js',
    'gerente/ui/consultas.js', 'gerente/ui/conexao.js', 'gerente/ui/dados.js',
]
CSS = ['estilos/base.css', 'estilos/extra.css', 'estilos/painel.css', 'estilos/gerente.css']

PAGINAS = {
    'index.html': dict(
        titulo='Ponto de Entregas Collina',
        desc='Ponto de entregas do Empório Collina: entrada, pausas, entregas por foto da comanda, valores e painel. Funciona no navegador.',
        corpo='paginas/entregador.html', js=COMPARTILHADO + ENTREGADOR, inicio='boot();',
        teste=dict(js=['testes/entregador.js'], inicio='runSelfTestsView();'),
    ),
    'gerente.html': dict(
        titulo='Gerência · Ponto Collina',
        desc='Acompanhamento do desenvolvimento individual dos entregadores do Empório Collina.',
        corpo='paginas/gerente.html', js=COMPARTILHADO + GERENTE, inicio='mgrBoot();',
        # o painel é testado com fechamentos de verdade, então os testes usam também o lado do entregador que gera o arquivo
        teste=dict(js=['entregador/banco.js', 'entregador/fechamento.js', 'entregador/envio.js', 'testes/gerente.js'], inicio='runMgrTestsView();'),
    ),
}


def ler(rel):
    return open(os.path.join(SRC, rel), encoding='utf-8').read()


def montar(cfg, extra_js=(), inicio=None):
    css = '\n'.join(ler(f) for f in CSS)
    logo = base64.b64encode(open(os.path.join(SRC, 'assets', 'logo.jpg'), 'rb').read()).decode()
    js = '\n'.join(ler(f) for f in list(cfg['js']) + list(extra_js))
    return f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1a0f0a">
<meta name="description" content="{cfg['desc']}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{cfg['titulo']}">
<meta name="robots" content="noindex">
<title>{cfg['titulo']}</title>
<link id="ico" rel="icon">
<link id="ico2" rel="apple-touch-icon">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Fraunces:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
{css}
</style>
</head>
<body>
{ler(cfg['corpo'])}
<script>
'use strict';
const LOGO = "data:image/jpeg;base64,{logo}";
{js}
{inicio or cfg['inicio']}
</script>
</body>
</html>
'''


def gravar(caminho, texto):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    open(caminho, 'w', encoding='utf-8', newline='\n').write(texto)


def manifesto():
    m = {'css': CSS, 'paginas': {n: {'arquivos': c['js'], 'testes': c['teste']['js']} for n, c in PAGINAS.items()}}
    gravar(os.path.join(TESTE, 'manifesto.json'), json.dumps(m, indent=1))


def passo(nome, comando):
    print(f'\n== {nome}')
    r = subprocess.run(comando, cwd=AQUI, shell=False)
    if r.returncode:
        print(f'\nFALHOU: {nome}. Nada foi publicado.')
        sys.exit(r.returncode)


def main():
    rapido = '--rapido' in sys.argv
    manifesto()
    if not rapido:
        passo('Lint e camadas', ['node', 'tools/lint.mjs'])
        passo('Consistência de botões e ids', ['node', 'tools/consistencia.mjs'])
    for nome, cfg in PAGINAS.items():
        html = montar(cfg)
        gravar(os.path.join(TESTE, 'pronto', nome), html)
        print(f'{nome}: {len(html) // 1024} KB')
        t = cfg['teste']
        gravar(os.path.join(TESTE, nome.replace('.html', '.teste.html')), montar(cfg, t['js'], t['inicio']))
    if not rapido:
        testar()
    for nome in PAGINAS:                      # só depois de tudo certo os arquivos publicados são trocados
        shutil.copyfile(os.path.join(TESTE, 'pronto', nome), os.path.join(AQUI, nome))
    print('\nArquivos montados' + ('.' if rapido else ' e testados: TUDO CERTO.'))


def testar():
    passo('Testes do aplicativo e do painel', ['node', 'tools/testar.mjs'])
    py = os.environ.get('PYTHON', sys.executable)
    passo('Testes das ferramentas Python', [py, '-m', 'pytest', 'ferramentas/testes', '-q', '-p', 'no:cacheprovider'])


if __name__ == '__main__':
    main()
