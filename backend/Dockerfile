# Stage 1: builda o frontend estático
FROM node:20-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend + build do frontend copiado pro lugar que main.py já espera
FROM python:3.12-slim AS app
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY --from=frontend-build /src/frontend/dist frontend/dist

WORKDIR /app/backend
EXPOSE 3011
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3011"]
