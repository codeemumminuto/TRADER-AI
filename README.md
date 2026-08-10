# Trader AI (BinAI)

Assistente de análise técnica: indicadores reais (RSI, MACD, EMAs, Bollinger, ADX, Suporte/Resistência)
calculados a partir de candles de mercado real (cripto via Binance, forex via Twelve Data), combinados
com uma IA que reconhece padrões de candlestick/price action e um modelo quantitativo de série temporal
(Chronos) que projeta um preço-alvo. As três leituras (Indicadores / IA / Estatística) e o consenso final
aparecem separadas na tela, com score de confiança, preço previsto e até quando essa previsão vale — sem
simular resultado (WIN/LOSS), é um log de previsões, não uma corretora simulada.

Multi-usuário: um administrador cadastra os usuários e libera os IPs de onde cada um pode logar. Cada
usuário só vê seus próprios sinais/histórico.

## Rodando tudo com Docker (recomendado)

```
docker compose up -d db      # só o Postgres, se for rodar o backend fora de container pra iterar
# ou
docker compose up -d         # sobe Postgres + app inteiro (build do frontend embutido)
```

Variáveis de ambiente do serviço `app` (opcionais, têm default — ver `docker-compose.yml`):
`TWELVE_DATA_API_KEY`, `CORS_ORIGIN`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

No primeiro start, se não existir nenhum admin no banco, um é criado automaticamente a partir de
`ADMIN_EMAIL`/`ADMIN_PASSWORD` — é com essa conta que você loga a primeira vez pra cadastrar os demais
usuários e liberar os IPs deles.

## Rodando o backend sem Docker (dev)

```
cd backend
python -m venv venv
./venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source venv/bin/activate && pip install -r requirements.txt  # Linux/Mac
cp .env.example .env   # preencher TWELVE_DATA_API_KEY, ADMIN_EMAIL/ADMIN_PASSWORD etc.
docker compose up -d db   # precisa do Postgres rodando (DATABASE_URL aponta pro localhost:5432)
./venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

## Rodando o frontend

```
cd frontend
npm install
npm run dev
```

Abrir http://localhost:5174

## Chaves necessárias

- `TWELVE_DATA_API_KEY`: gratuita em https://twelvedata.com/pricing — necessária apenas para os ativos forex (EUR/USD, GBP/USD, etc). Sem ela, o app funciona normalmente com os ativos cripto (Binance, sem key).

## Autenticação e multi-usuário

- Sessão por cookie httpOnly (não JWT) — token opaco guardado numa tabela `sessions`, o que permite
  revogar na hora e checar o IP de origem a cada request, não só no login.
- IP allowlist só vale pra usuários comuns (`role=user`) — o admin loga de qualquer IP. Aceita IP
  único ou faixa CIDR. Um usuário sem nenhum IP liberado não consegue logar.
- Um usuário só enxerga (`/analyze`, `/history`) os próprios dados — isolamento por `user_id` nas
  queries, ver `backend/app/history.py` e as rotas em `backend/app/main.py`.
- 5 tentativas de senha erradas seguidas bloqueiam o login por 15 minutos.

## Produção

Live em https://trader-ai.sint.dev.br — deploy automático via GitHub Actions
(`.github/workflows/deploy.yml`) a cada push na `main`. Em produção, o próprio FastAPI serve o
build estático do frontend (mesma origem, sem CORS pra configurar) — ver o mount condicional de
`frontend/dist` no fim de `backend/app/main.py`.

Essa implantação atual roda sem Docker (CloudPanel + PM2 direto na VPS, sem Postgres ainda) — a
migração pra rodar o `docker-compose.yml` em produção é um passo separado, ainda não feito.

## Notas importantes

- Não há suporte a ativos "OTC" (fins de semana) — esses são séries sintéticas proprietárias de cada corretora binária, sem fonte pública de dados. O app usa apenas mercado real, aberto.
- Os indicadores e o modelo quantitativo (Chronos) são cálculo/previsão real, não a IA "inventando" um número — a IA dá uma leitura independente própria (padrões de candlestick), mostrada separada.
- `torch` é instalado a partir do índice CPU-only do PyTorch (ver `requirements.txt`) — a inferência do modelo estatístico roda inteira em CPU, então a wheel padrão com a stack CUDA completa seria só desperdício de espaço.
