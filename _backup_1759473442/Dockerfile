FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# dependências para build do coincurve e cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 build-essential ca-certificates tzdata \
    autoconf automake libtool pkg-config \
    libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

VOLUME ["/data"]

ENV FLASK_ENV=production
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=8081

CMD ["gunicorn","--bind","0.0.0.0:8081","app:app","--workers","2","--access-logfile","-","--error-logfile","-"]
