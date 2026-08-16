# Estoque em Dia — protótipo

App para o Rony: tira foto de uma nota fiscal, a IA lê os itens e quantidades,
e depois de você confirmar, atualiza o estoque num dashboard simples.

## Rodar local
```
npm install
export ANTHROPIC_API_KEY=sua_chave_aqui
npm start
```
Abra http://localhost:3000

## Deploy no Railway
1. Suba este código para um repositório no GitHub.
2. No Railway, conecte o repositório (novo serviço a partir do GitHub).
3. Nas variáveis de ambiente do serviço, adicione `ANTHROPIC_API_KEY` com sua chave da Anthropic.
4. Gere um domínio público para o serviço.

## Observações
- Os dados ficam salvos em `data.json` no próprio servidor — bom para testar,
  mas ainda não é um banco de dados de verdade nem tem backup. Antes de usar
  com o Rony pra valer, trocar por um banco (Postgres, por exemplo) e configurar
  um volume persistente no Railway.
- Nomes de produto extraídos pela IA podem variar entre notas do mesmo item
  (ex: "Nutella 350g" vs "NUTELLA 350G FERRERO"). Ainda não há reconciliação
  automática de nomes — cada variação vira um produto novo no estoque.
