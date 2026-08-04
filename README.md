# Trader AI (BinAI)

Assistente de análise técnica: indicadores reais (RSI, MACD, EMAs, Bollinger, ADX, Suporte/Resistência)
calculados a partir de candles de mercado real (cripto via Binance, forex via Twelve Data), combinados
com uma IA que reconhece padrões de candlestick/price action e um modelo quantitativo de série temporal
(Chronos) que projeta um preço-alvo. As três leituras (Indicadores / IA / Estatística) e o consenso final
aparecem separadas na tela, com score de confiança, preço previsto e até quando essa previsão vale — sem
simular resultado (WIN/LOSS), é um log de previsões, não uma corretora simulada.

## Rodando o backend

```
cd backend
python -m venv venv
./venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# source venv/bin/activate && pip install -r requirements.txt  # Linux/Mac
cp .env.example .env   # preencher (opcional) TWELVE_DATA_API_KEY
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

## Produção

Live em https://trader-ai.sint.dev.br — deploy automático via GitHub Actions
(`.github/workflows/deploy.yml`) a cada push na `main`. Em produção, o próprio FastAPI serve o
build estático do frontend (mesma origem, sem CORS pra configurar) — ver o mount condicional de
`frontend/dist` no fim de `backend/app/main.py`.

## Notas importantes

- Não há suporte a ativos "OTC" (fins de semana) — esses são séries sintéticas proprietárias de cada corretora binária, sem fonte pública de dados. O app usa apenas mercado real, aberto.
- Os indicadores e o modelo quantitativo (Chronos) são cálculo/previsão real, não a IA "inventando" um número — a IA dá uma leitura independente própria (padrões de candlestick), mostrada separada.
- `torch` é instalado a partir do índice CPU-only do PyTorch (ver `requirements.txt`) — a inferência do modelo estatístico roda inteira em CPU, então a wheel padrão com a stack CUDA completa seria só desperdício de espaço.
