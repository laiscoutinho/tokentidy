# Comentários de ignore

> 🇺🇸 Para ler este arquivo em inglês, [clique aqui](../ignore-comments.md).

Às vezes um valor fixo no código é intencional: a cor da marca de um parceiro, um ajuste para um navegador. Um **comentário de ignore** diz ao TokenTidy para aceitá-lo, dizendo **qual regra** e **por quê**.

## Escrevendo um

Use a sintaxe de comentário do arquivo:

```css
.partner { color: #e4002b; } /* tokentidy-ignore-line color/hardcoded -- cor da marca do parceiro */

/* tokentidy-ignore-next-line spacing/hardcoded, radius/hardcoded -- igual ao widget legado */
.legacy { padding: 7px; border-radius: 3px; }
```

| Diretiva | Ignora |
|---|---|
| `tokentidy-ignore-line` | Valores na mesma linha do comentário |
| `tokentidy-ignore-next-line` | Valores na linha abaixo do comentário |

Depois da diretiva vêm um ou mais [identificadores de regra](rules.md), separados por vírgula. Depois, opcional mas recomendado, ` -- ` e o motivo, para a próxima pessoa saber o porquê. `//` (SCSS, Less, JS), `<!-- -->` (HTML) e `{/* */}` (JSX) também funcionam.

## As regras são obrigatórias

Um `tokentidy-ignore-line` sozinho não ignora nada: ignorar "tudo" esconderia mais do que você quis. O TokenTidy avisa sobre isso, e sobre outros enganos, na saída de erro:

```
src/App.css:12:3	warning	ignore/too-broad	…
```

| Aviso | Significado |
|---|---|
| `ignore/too-broad` | Sem identificador de regra: nada foi ignorado |
| `ignore/unknown-rule` | O identificador de regra não existe (erro de digitação?) |
| `ignore/unused` | Nada naquela linha corresponde à regra: o comentário pode sair |

Avisos nunca mudam o código de saída.

## Ignorando arquivos ou pastas inteiros

Para código gerado, bibliotecas copiadas para o projeto ou pastas legadas, use `ignore` na configuração em vez de comentários:

```json
{
  "ignore": ["legacy/**", "**/*.generated.css"]
}
```

Veja [Configuração](configuration.md). Arquivos ignorados são listados como pulados, com o motivo `ignored`.
