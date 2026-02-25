# Stage 1: Build frontend
FROM node:20-slim AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Install backend dependencies
FROM python:3.11-slim AS backend
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# Stage 3: Production image
FROM backend AS production
COPY --from=frontend /app/dist /app/static
COPY openclaw-skill/echobridge/SKILL.md /app/SKILL.md
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
