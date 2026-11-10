# Micro-frontends

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../micro-frontends.md).

Quando vários apps dividem a mesma tela, cada um com seu código, a mesma decisão tende a se afastar: o card de um app tem `16px` de padding e o de outro `12px`, dois apps definem `--brand` com cores diferentes e vence o último carregado. O TokenTidy olha os apps juntos e aponta isso.

## Como os apps são encontrados

O `check` e o `generate` tratam o projeto como micro-frontends quando há **pelo menos dois** apps:

| Como | Exemplo |
|---|---|
| Duas ou mais pastas indicadas na linha de comando, cada uma com um `package.json` | `npx tokentidy check apps/checkout apps/catalog` |
| `workspaces` no `package.json` da raiz (npm, Yarn, ou no formato `{ "packages": [...] }`) | `"workspaces": ["apps/*"]` |
| Projetos de um `angular.json` com `root` próprio | `"projects": { "shell": { "root": "projects/shell" } }` |

O nome de um app é o `name` do seu `package.json`, ou o nome da pasta. Em `workspaces`, `*` cobre um nível de pasta e `!` exclui; `**` não é expandido.

## O que o `check` mostra

As linhas extras vêm depois das de sempre, com uma coluna de detalhe:

```
apps/catalog/a.css:1:9	violation	mfe/root-collision	--brand	#6366f1	same global token, different values: catalog #6366f1, checkout #4f46e5
apps/catalog/a.css:2:18	review	mfe/drift	.card padding	12px	same role, different values: catalog 12px, checkout 16px
apps/catalog/package.json:1:35	review	mfe/version-mismatch	@acme/tokens	^2.0.0	different versions of the design system: catalog ^2.0.0, checkout ^1.2.0
```

| Regra | Severidade | Quando |
|---|---|---|
| `mfe/root-collision` | violation | Dois apps definem a mesma custom property global (`:root`/`html`) com valores diferentes. Na mesma página, um sobrescreve o outro. `#FFF` e `white` são o mesmo valor |
| `mfe/drift` | review | O mesmo papel (tipo de token, família da propriedade e componente: `.card padding`) tem um valor mais usado diferente em cada app. Os tokens são seguidos até o valor |
| `mfe/version-mismatch` | review | Os apps dependem de versões diferentes do mesmo pacote de design system (um nome com `tokens`, `design-system`, `ui-kit` ou `theme`, ou um pacote que fornece tokens) |

Uma colisão faz o `check` terminar com `1`; desvios e diferenças de versão são para revisão e nunca falham. O resumo na saída de erro ganha uma linha:

```
2 micro-frontends: 2 global token collisions, 2 role drifts, 2 design-system version mismatches
```

Com `--json`, o resultado ganha `microFrontends: { projects, issues }` ([Saída JSON](json-output.md#check---json)). Com `--format github`, colisões são erros e o resto, avisos.

## Um pacote de tokens compartilhado: `generate --shared`

```bash
npx tokentidy generate --shared packages/tokens
```

Divide os tokens em dois:

- um valor usado por **dois ou mais apps** (ou fora de todos eles) vai para a pasta compartilhada, que funciona como um pacote. Ali, dois usos bastam, mesmo que `minOccurrences` seja maior;
- um valor usado por um só app vai para a pasta daquele app (`<app>/design-tokens`, ou o `output` da configuração).

```
shared	packages/tokens	1
catalog	apps/catalog/design-tokens	1
checkout	apps/checkout/design-tokens	1
```

Cada linha: nome, pasta e número de tokens. `--dry-run` e `--json` funcionam como sempre. Ele não pergunta: mantém os nomes gerados antes em cada pasta (como `--extend`), a não ser que você passe `--new`. Com menos de dois apps, é erro de uso (`2`). Os temas ainda não são divididos: para eles, rode o `generate` sem `--shared`.

Para trocar os valores depois, rode o `fix` por app, com a pasta dos tokens dele, por exemplo `npx tokentidy fix apps/checkout --tokens packages/tokens`. Só esse app muda; a raiz do projeto passa a ser a pasta que contém os dois (aqui, a raiz do repositório), e vale a config dela. Os imports do módulo de tokens e do `_tokens.scss` apontam para a pasta compartilhada com caminho relativo.
