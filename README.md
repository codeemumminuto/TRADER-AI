# Trader AI

Assistente de análise técnica: indicadores reais (RSI, MACD, EMAs, Bollinger, ADX) calculados a partir de candles de mercado real (cripto via Binance, forex via Twelve Data), combinados com uma IA que faz leitura independente de padrões de candle/price action, e um modelo quantitativo de série temporal (Chronos). As três leituras (Indicadores / IA / Quant) e o consenso final aparecem separados na tela, com score de confiança, countdown de entrada e painel de confluências.

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

## Exportar histórico pra treinar/analisar depois

`GET /history/export` devolve todo o histórico de análises em JSONL (um objeto JSON por linha — formato padrão de dataset pra fine-tuning), com indicadores, leitura da IA, previsão quantitativa e o resultado real (WIN/LOSS) de cada uma.

## Notas importantes

- Não há suporte a ativos "OTC" (fins de semana) — esses são séries sintéticas proprietárias de cada corretora binária, sem fonte pública de dados. O app usa apenas mercado real, aberto.
- Os indicadores e o modelo quantitativo (Chronos) são cálculo/previsão real, não a IA "inventando" um número — a IA dá uma leitura independente própria, mostrada separada.
- Cada análise é comparada por similaridade de padrão com todo o histórico real já resolvido (indicadores, confluência, alinhamento entre timeframes) e a confiança final é ajustada conforme a taxa de acerto de cenários parecidos — um reforço estatístico real, não um número inventado.
- O botão "Treinar IA" roda a mesma análise contra candles históricos já resolvidos (sem esperar o tempo real acontecer), gerando rapidamente uma base grande de dados reais que alimenta esse reforço.
