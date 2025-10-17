FROM python:3.11-slim

# instalar dependências de sistema necessárias para compilação de coincurve
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential \
    autoconf \
    automake \
    libtool \
    pkg-config \
    python3-dev \
    libffi-dev \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# tenta instalar dependências (pip builds coincurve)
RUN python -m pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# copia app
COPY . .

ENV PORT=8081
EXPOSE 8081
CMD ["gunicorn", "--bind", "0.0.0.0:8081", "app:app", "--workers", "2"]
