FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt
COPY backend/requirements.txt ./backend-requirements.txt
RUN pip install --upgrade pip \
    && pip install -r requirements.txt -r backend-requirements.txt

COPY backend/ backend/

WORKDIR /app/backend

RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

# Railway injects PORT at runtime.
CMD ["./docker-entrypoint.sh"]
