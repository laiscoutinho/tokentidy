# Dificuldades/desafios/relato durante o desenvolvimento

## Fase 0: TypeScript, Node e esqueleto da CLI

Registro técnico do que aconteceu na fase (complete com o seu relato).

- **`fast-glob` removido por segurança.** Ele depende do `braces`, que tem uma falha de negação de serviço (DoS) sem correção. A varredura passou a usar o `fs.glob` do próprio Node, estável a partir do 22.17. Lição: antes de instalar uma dependência, ver se o Node já resolve e rodar `npm audit`.
- **Saída da CLI repensada.** A primeira versão mostrava banner e tabela em todo comando. Mudou para a filosofia UNIX: só o dado, uma linha por registro, separado por tab. O banner ficou só no `--help`.
- **`npm link` esconde problemas de empacotamento.** O link usa a pasta inteira do projeto. Para testar como um usuário de verdade, passamos a usar `npm pack` e instalar o `.tgz` num projeto de teste.
- **Mensagem de erro imprecisa.** `tokentidy check README.md` dizia "Diretório não encontrado", mas o caminho existia, só não era uma pasta. Virou um erro próprio ("Não é um diretório"), com teste.
- **Migração para TypeScript + ESM (12/10/2026).**
  - O `commander` 15 já era só ESM e funcionava em CommonJS por meio de um remendo do Node (`require` de ESM). O `@angular/compiler`, necessário mais adiante, também é só ESM.
  - O Node 22.18+ executa `.ts` direto, então o `tsx` previsto no guia deixou de ser necessário. Mas o Node não executa `.ts` dentro de `node_modules`, por isso o pacote publicado leva JavaScript compilado (`dist/`).
  - Logo na primeira checagem de tipos, o TypeScript encontrou um uso errado do commander: o banner era impresso direto, mas o `addHelpText` espera receber o texto.
  - O `chalk` foi trocado pelo `util.styleText` do Node (uma dependência a menos).
- **Build na instalação pelo GitHub.** Com o script `prepack`, instalar direto do GitHub deixaria o pacote sem `dist/`. Trocado por `prepare`.
