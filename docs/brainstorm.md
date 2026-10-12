# Sobre o TokenTidy

O TokenTidy é uma ferramenta de linha de comando que encontra valores de design escritos "à mão" em projetos CSS, React e Angular, indica qual token de design deveria ser usado no lugar, corrige o código com segurança e, quando o projeto ainda não tem tokens, ajuda a criá-los com nomes que fazem sentido.

---

## 1. O problema que ela resolve

Todo projeto de interface precisa de consistência visual: as mesmas cores, os mesmos espaçamentos, as mesmas tipografias em todas as telas. Para garantir isso, equipes criam **tokens de design**, que são nomes oficiais para as decisões visuais do projeto (por exemplo, "cor primária", "espaçamento médio", "tamanho de título").

Na prática, porém, o código se desvia desse padrão sem ninguém perceber. Uma pessoa copia um azul de outro lugar e cola no arquivo. Outra escreve "17px" porque era o que parecia certo naquele momento. Uma terceira usa um cinza "quase igual" ao do sistema. Com o tempo, o projeto acumula dezenas ou centenas de valores soltos que deveriam ser tokens. Cada um deles torna mais difícil mudar o visual, manter o tema, garantir acessibilidade e conservar a identidade do produto.

Há ainda um segundo problema, anterior a esse: muitos projetos **nem chegaram a ter tokens**. Não existe um arquivo de referência para comparar, e criar um do zero, a partir de um código já existente, é um trabalho lento, manual e cheio de decisões subjetivas.

O TokenTidy foi pensado para atacar os dois problemas: **detectar e corrigir os desvios** onde já existe um padrão e **ajudar a criar o padrão** onde ele ainda não existe.

## 2. Objetivo

**Objetivo geral:** facilitar a adoção e a manutenção de tokens de design em projetos front-end, de forma simples, segura e transparente.

**Objetivos específicos:**

- Identificar, em arquivos de estilo e de componentes, os valores fixos que deveriam ser tokens.
- Dizer, para cada um, qual token usar, e explicar por que aquele token foi escolhido.
- Corrigir automaticamente o que puder ser corrigido sem risco, e mostrar antes o que será alterado.
- Sugerir novos tokens quando o projeto já tem um conjunto de tokens, mas há valores repetidos que ele não cobre.
- Gerar uma proposta de arquivo de tokens, com nomes semânticos, quando o projeto não tem nenhum.
- Ser fácil de instalar, de entender e de integrar ao fluxo de trabalho de uma equipe.

## 3. Para quem é

- **Pessoas desenvolvedoras front-end** que querem manter o código alinhado ao design system sem revisar tudo manualmente.
- **Designers e responsáveis por design systems** que precisam saber o quanto o código real está se afastando do que foi desenhado.
- **Equipes que estão começando** a adotar tokens em um projeto antigo e não sabem por onde começar.
- **Pesquisadores e estudantes** interessados em qualidade de código front-end e consistência visual.

## 4. Como ela funciona (visão geral)

O TokenTidy trabalha em quatro etapas, sempre na mesma ordem:

1. **Lê o projeto.** Percorre as pastas, ignora o que não interessa (dependências, arquivos gerados, controle de versão) e seleciona os arquivos de estilo e de componentes.
2. **Entende o código.** Em vez de apenas procurar textos, a ferramenta interpreta a estrutura de cada arquivo. Por isso consegue distinguir um valor que realmente é uma cor de um texto que apenas parece uma, e consegue apontar a posição exata de cada valor, até a linha e a coluna.
3. **Compara com os tokens.** Cada valor fixo é comparado com os tokens do projeto. A comparação é inteligente: `#FFF`, `#ffffff` e `rgb(255, 255, 255)` são reconhecidos como a mesma cor, e `16px` e `1rem` como o mesmo tamanho (com a base configurável).
4. **Reporta, sugere ou corrige.** Conforme o comando escolhido, apenas mostra os achados, propõe melhorias ou altera os arquivos.

## 5. O que ela analisa

### CSS e SCSS

Analisa arquivos de estilo, incluindo os que usam recursos do SCSS (variáveis, trechos reutilizáveis, comentários de linha). Verifica valores de:

- **Cor** (texto, fundo, bordas, sombras e semelhantes);
- **Espaçamento** (margens, preenchimentos, distâncias entre elementos);
- **Tipografia** (tamanho, altura de linha, família de fonte e peso).

Quando uma propriedade reúne vários valores em uma única linha (por exemplo, as quatro margens de um elemento), cada parte é avaliada separadamente e cada uma recebe sua própria localização.

### React

Analisa estilos escritos diretamente nos componentes (JSX e TSX). Entende as particularidades do React, como nomes de propriedades escritos de forma diferente do CSS tradicional e valores numéricos que o React interpreta como pixels. Estilos em arquivos de CSS importados pelos componentes são tratados como CSS comum.

### Angular

Analisa os estilos de componentes Angular, tanto os escritos dentro do próprio componente quanto os que ficam em arquivos separados, além de estilos aplicados diretamente em modelos (templates). Para o usuário, o resultado é o mesmo das outras tecnologias: um relatório com a localização de cada valor, mesmo quando ele está dentro de um arquivo de componente.

### O que **não** é considerado violação

Nem todo valor fixo é um problema. O TokenTidy reconhece e deixa passar, por padrão, valores que normalmente não representam uma decisão de design, como `0`, `auto`, `inherit`, `transparent` e `currentColor`, além de valores que **já usam** um token ou variável. Também respeita trechos que a equipe marcou explicitamente para serem ignorados.

## 6. O que ela faz, em detalhe

### 6.1 Detectar violações

A ferramenta percorre o projeto e lista cada valor fixo que deveria ser um token. Para cada achado, informa:

- o arquivo, a linha e a coluna;
- o trecho original;
- o tipo do valor (cor, espaçamento ou tipografia);
- a situação da correspondência com os tokens (veja abaixo).

Arquivos com erro de sintaxe não interrompem a análise: o problema é registrado e a ferramenta continua com os demais arquivos.

### 6.2 Sugerir o token certo

Para cada valor, a ferramenta tenta encontrar um token correspondente e classifica o resultado em três níveis:

- **Exato:** o valor é igual ao de um token. A sugestão é direta e pode ser corrigida automaticamente.
- **Próximo:** o valor não é igual, mas está dentro de uma tolerância definida pela equipe. A ferramenta indica o token mais próximo e **explica a escolha**, por exemplo mostrando o quanto a cor se afasta do token sugerido. Por padrão, esses casos são apenas sugestões.
- **Sem sugestão:** não há token suficientemente próximo. O valor é apontado, mas sem proposta de substituição.

Quando mais de um token é igualmente adequado, a ferramenta usa um critério fixo e documentado para desempatar, de modo que o resultado seja sempre o mesmo para a mesma entrada.

A comparação de cores considera como as pessoas **percebem** as diferenças entre elas, e não apenas a diferença numérica entre os códigos. Isso faz com que a noção de "cor próxima" seja mais fiel ao que realmente se vê na tela.

### 6.3 Corrigir automaticamente

Ao pedir a correção, a ferramenta substitui os valores fixos pelos tokens correspondentes, editando apenas o trecho necessário. O restante do arquivo (formatação, comentários, organização) permanece como estava.

Os cuidados que acompanham a correção são parte da proposta:

- **Só o que é exato, por padrão.** Valores apenas próximos só são corrigidos se a pessoa pedir isso de forma explícita.
- **Simulação prévia.** É possível ver tudo o que seria alterado antes de gravar qualquer coisa.
- **Aviso sobre alterações pendentes.** Se o projeto tem mudanças ainda não salvas no controle de versão, a ferramenta avisa antes de reescrever arquivos.
- **Resultado previsível.** Rodar a correção duas vezes não muda nada na segunda vez.
- **Relatório do que mudou.** Ao final, a ferramenta informa quais arquivos foram alterados e quantas correções foram feitas.

### 6.4 Sugerir novos tokens

Quando o projeto já tem tokens, mas há valores que aparecem muitas vezes sem estar cobertos por nenhum deles, a ferramenta destaca esses casos como candidatos a novos tokens. Para cada candidato, mostra quantas vezes o valor aparece e em quais lugares, ajudando a equipe a decidir o que vale a pena formalizar.

### 6.5 Gerar um arquivo de tokens

Quando o projeto não tem tokens, a ferramenta propõe um. O processo é:

1. coletar todos os valores fixos do projeto;
2. agrupar os valores muito parecidos (por exemplo, dois tons de cinza quase idênticos ou espaçamentos de 15 e 16 pixels), escolhendo um representante para cada grupo;
3. priorizar os valores que mais se repetem;
4. dar a cada token um **nome semântico**, que descreve o papel do valor e não a aparência dele;
5. escrever a proposta em um arquivo de tokens em formato aberto e padronizado.

A geração é sempre uma **proposta para revisão humana**: ela mostra primeiro o que seria criado, nunca sobrescreve um arquivo de tokens existente e produz sempre o mesmo resultado para o mesmo projeto. Os nomes seguem uma taxonomia construída com base em um método de pesquisa publicado (Nickerson, Varshney e Muntermann, 2013), para que a nomenclatura tenha critério e possa ser justificada.

## 7. Opções e comandos

### Comandos

| Comando | O que faz |
|---|---|
| `tokentidy check` | Analisa o projeto e relata as violações. Não altera nenhum arquivo. É o comportamento padrão. |
| `tokentidy suggest` | Aponta valores recorrentes que ainda não são tokens e merecem virar tokens. |
| `tokentidy generate` | Cria uma proposta de arquivo de tokens a partir do projeto. |

### Opções

| Opção | O que faz |
|---|---|
| `--fix` | Aplica as correções seguras (valores exatos) nos arquivos e informa o que mudou. |
| `--dry-run` | Mostra o que seria alterado, sem gravar nada. |
| `--fix-approximate` | Também corrige valores apenas próximos. Exige pedido explícito. |
| `--tokens <caminho>` | Indica qual arquivo de tokens usar. |
| `--tolerance <valor>` | Define o quanto um valor pode diferir de um token para ser considerado "próximo". |
| `--ignore <padrão>` | Exclui pastas, arquivos ou tipos de arquivo da análise. |
| `--json` | Entrega o resultado em formato estruturado, para uso em automações. |
| `--quiet` | Reduz a saída ao essencial. |
| `--no-color` | Desativa as cores no terminal. |
| `--force` | Permite gravar mesmo com alterações pendentes no controle de versão. |
| `--help` | Mostra a ajuda, com exemplos de uso. |
| `--version` | Mostra a versão instalada. |

### Configuração do projeto

Além das opções de linha de comando, a equipe pode guardar suas escolhas em um arquivo de configuração versionado junto com o projeto: onde estão os tokens, o que ignorar, qual a tolerância, quais tipos de valor verificar e quais exceções aceitar. Assim, todas as pessoas e o ambiente de integração contínua usam as mesmas regras. As opções informadas na linha de comando têm prioridade sobre o arquivo.

### Códigos de saída e uso em integração contínua

A ferramenta sinaliza o resultado para quem a executa: um código indica "nenhuma violação", outro indica "violações encontradas" e outro indica "erro de uso ou de execução". Com isso, uma equipe pode fazer com que a verificação de tokens bloqueie uma entrega que traga novos desvios. A saída estruturada (`--json`) facilita registrar e acompanhar os resultados ao longo do tempo.

## 8. O que torna o TokenTidy diferente

Estes são os pontos que definem a proposta da ferramenta:

1. **Atende quem ainda não tem tokens.** Nas ferramentas estudadas durante o desenvolvimento do projeto, o foco costuma estar em verificar o código contra tokens que já existem. O TokenTidy também cobre o ponto de partida: analisa o projeto e propõe os tokens que ele ainda não tem. Isso reduz muito a barreira de entrada para equipes com projetos antigos.

2. **Nomes semânticos com base científica.** Os tokens gerados não recebem nomes arbitrários como "cor 1" ou "cor 2". A nomenclatura segue uma taxonomia construída por um método publicado e reconhecido, o que dá coerência e permite justificar as decisões, inclusive em contexto acadêmico.

3. **Sugestões que se explicam.** A ferramenta não diz apenas "isto está errado". Ela mostra qual token propõe, o quanto o valor se afasta dele e por que ele foi escolhido, de modo que a pessoa possa confiar na sugestão ou discordar com conhecimento de causa.

4. **Correção que respeita o seu código.** Altera só o necessário, mostra tudo antes de gravar, corrige por padrão apenas o que é exato, avisa sobre alterações pendentes e dá o mesmo resultado se for executada de novo.

5. **Simplicidade de uso.** É uma ferramenta que se instala, se executa e entrega resultado. Não exige processos em segundo plano, serviços externos nem inteligência artificial. O comportamento é previsível e reproduzível.

6. **Angular como parte do escopo central.** Muitas ferramentas de qualidade visual priorizam o ecossistema React. O TokenTidy trata o Angular com o mesmo cuidado, inclusive estilos escritos dentro dos componentes e dos modelos.

7. **Origem em pesquisa.** A ferramenta nasce de um projeto de pesquisa sobre violações de tokens de design em projetos front-end de código aberto. Isso a ancora em observação de projetos reais, e não apenas em opinião sobre o que seria útil.

> **Observação sobre os comparativos:** as afirmações sobre outras ferramentas refletem o que foi observado durante o estudo do projeto. Antes de publicá-las externamente, vale conferir novamente a documentação atual de cada uma.

## 9. Princípios de projeto

- **Nunca surpreender.** Nada é alterado sem pedido explícito, e tudo o que será alterado pode ser visto antes.
- **Explicar sempre.** Cada achado e cada sugestão vêm com o motivo.
- **Ser conservadora.** Na dúvida, sugere em vez de corrigir.
- **Ser previsível.** A mesma entrada produz sempre o mesmo resultado.
- **Ser robusta.** Um arquivo com problema não impede a análise do restante do projeto.
- **Ser simples.** Faz poucas coisas e as faz bem; recursos fora do escopo são recusados de forma consciente.
- **Respeitar a pessoa usuária.** Não coleta dados de uso e não envia nada para fora do computador.

## 10. Cenários de uso

**Cenário 1: projeto com tokens, em andamento.** A equipe roda a verificação antes de cada entrega. A ferramenta aponta as cores e os espaçamentos que fugiram do padrão, a pessoa desenvolvedora vê a simulação das correções, aplica as exatas e revisa à mão as sugestões próximas.

**Cenário 2: projeto antigo, sem tokens.** A equipe pede a geração. A ferramenta propõe um arquivo de tokens com os valores mais recorrentes e nomes semânticos. A equipe revisa, ajusta nomes e valores, adota o arquivo e passa a usar a verificação normalmente.

**Cenário 3: projeto com tokens, mas com lacunas.** A equipe pede sugestões. A ferramenta mostra valores muito repetidos que não têm token e indica onde eles aparecem. A equipe decide quais viram tokens novos.

**Cenário 4: integração contínua.** A verificação roda automaticamente a cada alteração enviada. Se surgirem novas violações, o processo falha e o relatório indica exatamente onde corrigir.

## 11. Limites e o que está fora do escopo

Para manter a ferramenta simples e confiável, alguns itens ficam de fora de forma deliberada:

- **Tailwind** e outras abordagens baseadas em classes utilitárias.
- **Inteligência artificial** e integrações com assistentes automáticos.
- **Estilos dinâmicos**, calculados apenas quando o programa está em execução. Só valores escritos de forma literal são analisados.
- **Histórico do controle de versão** e **análise em lote de vários repositórios.**
- **Estilos escritos em bibliotecas de CSS dentro de JavaScript**, que não fazem parte do escopo inicial.

Essas limitações estão declaradas para que a pessoa usuária saiba exatamente o que esperar.

## 12. Estado do projeto

O TokenTidy está em desenvolvimento, como parte de um projeto de iniciação científica no IFCE dedicado ao estudo de violações de tokens de design em projetos front-end de código aberto. A construção é feita em fases, começando pela detecção em CSS e avançando por React, Angular, correção automática e geração de tokens. Este documento descreve o que a ferramenta se propõe a ser e pode ser atualizado à medida que cada capacidade for concluída.