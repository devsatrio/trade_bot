FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run initialization script then start server with hot-reload
CMD python init_db.py && uvicorn main:app --host 0.0.0.0 --port 8000 --reload
