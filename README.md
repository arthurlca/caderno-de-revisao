# Caderno de Revisão

Um app de **questões de múltipla escolha** para revisar matéria: você monta cadernos a partir de arquivos CSV,
responde com cronômetro e acompanha a sua nota ao longo do tempo. Feito para o celular e funciona **offline**.

**Abrir o app:** https://arthurlca.github.io/caderno-de-revisao/

- **Cadernos** criados a partir de um ou mais CSVs, com 2 a 5 alternativas por questão
- **Revisão com cronômetro**: você responde, vê na hora se acertou e a explicação
- **Histórico**: nota (%), acertos e tempo das últimas 5 revisões de cada caderno e pasta
- **PDF de erros**: todas as questões que você já errou, das mais erradas para as menos erradas, com a explicação
- **Pastas** com **revisão da pasta**: junta as questões de pior desempenho de todos os cadernos
- **Backup** em JSON, modo escuro automático, instalável no iPhone (PWA)
- HTML, CSS e JavaScript puros, sem framework e sem etapa de build

---

## Privacidade

**Seus dados nunca saem do seu aparelho.** Tudo fica guardado localmente no navegador (IndexedDB).
O app não tem servidor, login, analytics nem cookies. Quem abre o link recebe o app vazio.
Como os dados só existem no aparelho, **faça backups** (Ajustes → Exportar backup).

---

## Formato do CSV

Cada linha é uma questão, com quatro colunas:

```
pergunta | opcoes | resposta | explicacao
```

```
O objeto da contabilidade é: | ['A - Patrimônio','B - Lucro','C - Os ativos','D - As aziendas','E - As demonstrações contábeis'] | A | Segundo o CPC 00, o objeto da contabilidade é o patrimônio
```

| Coluna | Como preencher |
|---|---|
| `pergunta` | O enunciado. |
| `opcoes` | Lista com **2 a 5** alternativas: `['A - x','B - y']`. Aspas retas, curvas (’) ou duplas; também aceita JSON (`["x","y"]`) ou `A) x; B) y`. Os prefixos `A - `, `B) ` etc. são removidos e o app mostra as letras. |
| `resposta` | A letra da correta (`A`), o número (`1`) ou o texto da alternativa. |
| `explicacao` | Opcional. Aparece depois de responder e no PDF de erros. `\n` vira quebra de linha. |

- O separador é detectado sozinho: `|`, tab, `;` ou `,`. Uma linha de cabeçalho é ignorada.
- Com `,` como separador, coloque entre aspas duplas os campos que têm vírgula (o Excel faz isso ao salvar como CSV).
  Se a lista de opções estiver sem aspas, o app ainda tenta remontá-la pelos colchetes.
- Arquivos em UTF-8 ou Windows-1252 são aceitos.
- Linhas com problema (menos de 2 ou mais de 5 alternativas, resposta que não bate com nenhuma alternativa…) são
  mostradas na prévia com o número da linha e ignoradas.
- Perguntas repetidas (mesmo enunciado) são ignoradas, com opção de importar mesmo assim.

Em **Ajustes → Baixar CSV modelo** há um arquivo de exemplo.

---

## Como usar

### Cadernos
- **+ → Novo caderno**: dê um nome e escolha um ou mais CSVs (ou cole o texto). A prévia mostra quantas questões
  foram lidas e o que foi ignorado.
- No caderno, **⋯** permite adicionar mais questões, renomear, mover para uma pasta, zerar o histórico ou excluir.

### Revisão
1. Escolha **Todas** ou **Só algumas** (e quantas, sorteadas entre as do caderno) e toque em **Iniciar revisão**.
   As questões aparecem em ordem aleatória, e o cronômetro começa.
2. Toque numa alternativa: a correta fica verde, a sua (se errada) fica vermelha, e aparece a explicação.
3. **Próxima** até o fim. O resultado mostra nota, acertos, tempo total, a comparação com a revisão anterior e as
   questões que você errou.

O cronômetro conta o **tempo para responder**: ele pausa enquanto a correção está na tela e quando o app vai para
o segundo plano. Sair no meio descarta a revisão.
Com teclado: **A–E** ou **1–5** respondem, **Enter** avança.

### Histórico e PDF
- A tela do caderno mostra as **últimas 5 revisões** (gráfico da nota, média, melhor nota, tempo médio e tabela).
- **PDF de erros**: todas as questões que você já errou em qualquer revisão, **das mais erradas para as menos**,
  com as alternativas, a correta destacada, quantas vezes errou e a explicação.
- Na tabela das últimas 5 revisões, o botão **⤓** de cada linha baixa o PDF dos erros daquela revisão
  (com a alternativa que você marcou). O mesmo PDF está no resultado, ao terminar.

### Pastas e revisão da pasta
- **+ → Nova pasta**: dê o nome e escolha vários CSVs. **Cada arquivo vira um caderno**, com o nome do arquivo sem a
  extensão (dá para mudar antes de criar). Numa pasta existente, **Importar cadernos (vários CSV)** faz o mesmo.
- Uma pasta agrupa vários cadernos; cada caderno mantém o próprio histórico.
- **Revisar pasta**: escolha quantas questões (até 100). Entram as de **pior desempenho** (maior taxa de erro,
  depois mais erros) entre todos os cadernos da pasta. Se você ainda não errou questões suficientes, o restante é
  completado com questões aleatórias; se a pasta tiver menos questões que o pedido, entram todas.
- A pasta tem o próprio histórico das últimas 5 revisões e o próprio PDF de erros.
- Acertos e erros contam para a questão tanto na revisão do caderno quanto na da pasta.

---

## Instalar no iPhone

1. Abra **https://arthurlca.github.io/caderno-de-revisao/** no **Safari**.
2. **Compartilhar → Adicionar à Tela de Início → Adicionar**.
3. Abra pelo ícone. Na primeira vez, esteja com internet; depois funciona em modo avião.

> O app instalado guarda dados **separados** do Safari. Use o backup para passar dados de um para o outro.

Os PDFs e backups abrem a folha de compartilhamento do iPhone (**Salvar em Arquivos**, AirDrop, etc.).
**Atualizações:** feche e abra o app. Se você estiver no meio de uma revisão, a atualização espera você sair da tela.

---

## Desenvolvimento

Requer apenas **Node.js 18+**, sem `npm install`.

```bash
npm run serve   # servidor local em http://localhost:8080
npm test        # testes (node:test): importação CSV, seleção, histórico, PDF, backup, service worker
npm run bump    # atualiza a versão do cache offline — rode antes de publicar
npm run icons   # regenera os ícones PNG
```

### Estrutura

```
index.html, manifest.webmanifest   página única e manifesto do PWA
sw.js                              service worker: cache-first, versionado por hash do conteúdo
css/app.css                        estilos (claro/escuro, safe areas do iPhone)
js/app.js                          inicialização e rotas (#/…)
js/core/                           lógica pura, sem DOM, testada no Node
  quiz-import.js                     leitura das questões (colunas, opções, resposta)
  review.js                          seleção da pasta, nota, estatísticas, relatório de erros
  pdf-report.js                      montagem do PDF com o jsPDF
  csv.js, backup.js, format.js
js/data/db.js                      IndexedDB (pastas, cadernos, questões, revisões)
js/ui/                             telas
vendor/jspdf.umd.min.js            jsPDF, vendorizado para funcionar offline
tools/, tests/
```

### Dados (IndexedDB)
| Store | Conteúdo |
|---|---|
| `folders` | `{ id, name }` |
| `notebooks` | `{ id, name, folderId }` |
| `questions` | `{ id, notebookId, question, options[], answer, explanation, attempts, wrongs, lastWrongAt }` |
| `sessions` | `{ scope: 'notebook'\|'folder', scopeId, finishedAt, durationMs, total, correct, score, answers[] }` |
| `meta` | data do último backup |

### Publicar
GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `(root)`**. Rode `npm run bump` antes de cada
publicação, senão quem já instalou continua com a versão antiga do cache.

---

## Créditos

- PDF: [jsPDF](https://github.com/parallax/jsPDF) 4.2.1, licença MIT, incluído em `vendor/`.
