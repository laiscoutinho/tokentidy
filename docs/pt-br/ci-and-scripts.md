# Scripts e CI

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../ci-and-scripts.md).

O TokenTidy segue o jeito UNIX: a saída padrão só tem dados, um item por linha, e os resumos vão para a saída de erro. Isso facilita combinar com outras ferramentas e rodar de forma automática.

## Filtrando o resultado

Os campos do `check` são separados por tabulação (posição, severidade, regra, propriedade, valor), então `awk`, `grep`, `cut` e `sort` funcionam direto:

```bash
npx tokentidy check ./src | awk -F'\t' '$3 == "color/hardcoded"'  # só cores
npx tokentidy check ./src | grep -v '\treview\t'                  # só violações
npx tokentidy check ./src | cut -f5 | sort | uniq -c | sort -rn    # valores mais repetidos (candidatos a token)
```

Para algo mais complexo, use a [saída JSON](json-output.md).

## Um script do npm

No seu `package.json`:

```json
{
  "scripts": {
    "tokens:check": "tokentidy check src"
  }
}
```

Depois, `npm run tokens:check`. Dentro de scripts do npm, o `npx` não é necessário.

## No CI

O `check` termina com código de saída `1` quando encontra uma violação ([Códigos de saída](exit-codes.md)), então a etapa do CI falha. Itens de revisão e avisos nunca fazem falhar. Um job do GitHub Actions:

```yaml
name: Design tokens
on: [push, pull_request]
jobs:
  tokens:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tokentidy check src
      - run: npx tokentidy validate
```

O `validate` faz o passo falhar quando um arquivo de tokens tem um alias quebrado, um ciclo ou não segue o schema DTCG ([validate](validate.md)).

Três detalhes para o CI:

- O `generate` nunca espera uma resposta fora de um terminal: quando já existem arquivos de tokens, passe `--extend` ou `--new`.
- O `fix --dry-run` termina com `1` quando sobrariam violações, então também pode ser uma verificação no CI.
- O `fix --approximate` também nunca espera uma resposta: passe `--yes` (aplica o que passa pelas guardas; grupos rejeitados no `tokentidy.decisions.json` continuam rejeitados) ou `--no-input` (só lista).

## Anotações no pull request

Com `--format github`, cada violação e erro de sintaxe vira uma anotação de erro na linha do diff, e cada item de revisão vira um aviso:

```yaml
      - run: npx tokentidy check --format github
```

O código de saída é o mesmo, então a etapa continua falhando quando há violações. Os caminhos são relativos à pasta atual, que no Actions é a raiz do repositório.

## Em um projeto que já tem violações

Salve um [baseline](check.md#adotar-em-um-projeto-que-já-tem-violações) e faça commit dele, para o build falhar só em violações novas:

```bash
npx tokentidy check --print-baseline > tokentidy.baseline.json
npx tokentidy check --baseline tokentidy.baseline.json
```

## Antes de cada commit

Para verificar só os arquivos que estão indo no commit, passe-os como caminhos. Com o [lint-staged](https://github.com/lint-staged/lint-staged), por exemplo:

```json
{
  "lint-staged": {
    "*.{css,scss,sass,less,html,jsx,tsx}": "tokentidy check"
  }
}
```

Um arquivo passado pelo nome sempre é analisado, mesmo um arquivo de teste que a varredura de uma pasta pularia.

Só os arquivos do commit são informados, e eles são julgados com o projeto inteiro em vista ([Analisando parte de um projeto](check.md#analisando-parte-de-um-projeto)), então a resposta é a mesma de uma execução completa. O custo é ler o projeto a cada commit.
